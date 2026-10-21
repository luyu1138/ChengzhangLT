package cn.chengzhang.blueprint;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.PersistableBundle;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.json.JSONObject;

final class CloudBackup {
    static final int DAILY_JOB = 2001, NOW_JOB = 2002, CATCH_UP_JOB = 2003;
    private static final Object CONFIG = new Object(), TRANSFER = new Object();
    private static final java.util.concurrent.ExecutorService QUEUE = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static SharedPreferences statusPrefs(Context c) { return c.getSharedPreferences("oss-backup-status", 0); }
    private static JSONObject read(Context c) throws Exception { synchronized (CONFIG) { return new SecureSettings(c).read(); } }
    static JSONObject status(Context c) throws Exception {
        synchronized (CONFIG) {
            JSONObject config = read(c); SharedPreferences p = statusPrefs(c);
            JSONObject result = new JSONObject().put("ok", true).put("configured", config != null)
                    .put("enabled", config != null && config.optBoolean("enabled"))
                    .put("running", p.getBoolean("running", false) && System.currentTimeMillis() - p.getLong("started", 0) < 15 * 60 * 1000)
                    .put("lastSuccessAt", p.getString("lastSuccessAt", "")).put("lastError", p.getString("lastError", ""))
                    .put("manualRequestId", p.getString("manualRequestId", "")).put("manualState", p.getString("manualState", ""))
                    .put("manualSuccessAt", p.getString("manualSuccessAt", "")).put("manualError", p.getString("manualError", ""))
                    .put("lastObjectKey", p.getString("lastObjectKey", "")).put("lastRevision", p.getLong("lastRevision", 0));
            if (config != null) { OssConfig checked = new OssConfig(config); result.put("bucket", checked.bucket).put("region", checked.region).put("endpoint", checked.endpoint()); }
            return result;
        }
    }
    static void configure(Context c, JSONObject input) throws Exception {
        synchronized (CONFIG) {
            JSONObject old = new SecureSettings(c).read();
            if (input.optString("accessKeyId").isEmpty() != input.optString("accessKeySecret").isEmpty())
                throw new IllegalArgumentException("更换凭据时请同时填写 AccessKey ID 和 Secret");
            if (old != null) for (String field : new String[]{"accessKeyId", "accessKeySecret", "recoveryCode"})
                if (input.optString(field).isEmpty()) input.put(field, old.getString(field));
            if (old == null && !input.optBoolean("recoverySaved")) throw new IllegalArgumentException("请先单独保存备份恢复码并确认");
            // Saving credentials does not change the user's automatic-backup switch.
            input.put("generation", UUID.randomUUID().toString()).put("enabled", old != null && old.optBoolean("enabled"));
            new OssConfig(input);
            new SecureSettings(c).write(input);
            c.getSystemService(JobScheduler.class).cancel(NOW_JOB);
            statusPrefs(c).edit().clear().apply();
            catchUp(c);
        }
    }
    static void setEnabled(Context c, boolean enabled) throws Exception {
        synchronized (CONFIG) {
            JSONObject config = new SecureSettings(c).read();
            if (config == null) throw new IllegalStateException("请先保存 OSS 配置");
            boolean previous = config.optBoolean("enabled");
            // Keep generation unchanged: switching off automatic work must not cancel manual work.
            config.put("enabled", enabled); new SecureSettings(c).write(config);
            if (enabled) {
                try { catchUp(c); }
                catch (Exception e) {
                    config.put("enabled", previous); new SecureSettings(c).write(config);
                    if (!previous) {
                        JobScheduler scheduler = c.getSystemService(JobScheduler.class);
                        scheduler.cancel(DAILY_JOB); scheduler.cancel(CATCH_UP_JOB);
                    }
                    throw e;
                }
            }
            else {
                JobScheduler scheduler = c.getSystemService(JobScheduler.class);
                scheduler.cancel(DAILY_JOB); scheduler.cancel(CATCH_UP_JOB);
            }
        }
    }
    static void disable(Context c) throws Exception { setEnabled(c, false); }
    static void forget(Context c) throws Exception {
        synchronized (CONFIG) {
            JobScheduler scheduler = c.getSystemService(JobScheduler.class);
            scheduler.cancel(DAILY_JOB); scheduler.cancel(NOW_JOB); scheduler.cancel(CATCH_UP_JOB);
            SecureSettings.erase(c); statusPrefs(c).edit().clear().apply();
        }
    }
    static String recoveryCode(Context c) throws Exception {
        JSONObject config = read(c); if (config == null) throw new IllegalStateException("尚未配置 OSS");
        return config.getString("recoveryCode");
    }
    static void ensureScheduled(Context c) throws Exception {
        synchronized (CONFIG) {
            JSONObject config = read(c); if (config == null || !config.optBoolean("enabled")) return;
            JobScheduler scheduler = c.getSystemService(JobScheduler.class);
            if (scheduler.getPendingJob(DAILY_JOB) == null) {
                JobInfo job = builder(c, DAILY_JOB).setPeriodic(24L * 60 * 60 * 1000, 60L * 60 * 1000).build();
                if (scheduler.schedule(job) != JobScheduler.RESULT_SUCCESS) throw new IllegalStateException("系统未接受每日备份任务，请稍后重试");
            }
        }
    }
    private static JobInfo.Builder builder(Context c, int id) {
        return new JobInfo.Builder(id, new ComponentName(c, OssBackupService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                .setBackoffCriteria(30L * 60 * 1000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
    }
    static String enqueue(Context c) throws Exception {
        synchronized (CONFIG) {
            if (read(c) == null) throw new IllegalStateException("请先保存 OSS 配置");
            SharedPreferences p = statusPrefs(c); JobScheduler scheduler = c.getSystemService(JobScheduler.class);
            String state = p.getString("manualState", ""), previous = p.getString("manualRequestId", "");
            if (!previous.isEmpty() && (state.equals("queued") || state.equals("running")) && scheduler.getPendingJob(NOW_JOB) != null) return previous;
            String id = UUID.randomUUID().toString(); PersistableBundle extras = new PersistableBundle(); extras.putString("requestId", id);
            p.edit().putString("manualRequestId", id).putString("manualState", "queued")
                    .putString("manualSuccessAt", "").putString("manualError", "").apply();
            if (scheduler.schedule(builder(c, NOW_JOB).setExtras(extras).setMinimumLatency(0).build()) != JobScheduler.RESULT_SUCCESS) {
                p.edit().putString("manualState", "failed").putString("manualError", "系统未接受备份任务，请稍后重试").apply();
                throw new IllegalStateException("系统未接受备份任务，请稍后重试");
            }
            return id;
        }
    }
    static void catchUp(Context c) throws Exception {
        synchronized (CONFIG) {
            ensureScheduled(c); JSONObject config = read(c);
            if (config != null && config.optBoolean("enabled") && !LocalDate.now().toString().equals(statusPrefs(c).getString("lastDay", ""))
                    && !statusPrefs(c).getBoolean("running", false)) {
                JobScheduler scheduler = c.getSystemService(JobScheduler.class);
                if (scheduler.getPendingJob(NOW_JOB) == null && scheduler.getPendingJob(CATCH_UP_JOB) == null
                        && scheduler.schedule(builder(c, CATCH_UP_JOB).setMinimumLatency(0).build()) != JobScheduler.RESULT_SUCCESS)
                    throw new IllegalStateException("系统未接受补备任务，请稍后重试");
            }
        }
    }
    static void onLocalSave(Context c) { Context app = c.getApplicationContext(); QUEUE.execute(() -> { try { catchUp(app); } catch (Exception ignored) { } }); }
    static boolean perform(Context c, boolean manual, String requestId, java.util.concurrent.atomic.AtomicBoolean stopped) {
        return perform(c, manual, requestId, stopped, new OssClient());
    }
    static boolean perform(Context c, boolean manual, String requestId, java.util.concurrent.atomic.AtomicBoolean stopped, OssClient client) {
        synchronized (TRANSFER) {
            SharedPreferences p = statusPrefs(c); String generation = null; boolean started = false;
            try {
                OssConfig config; String day = LocalDate.now().toString();
                synchronized (CONFIG) {
                    JSONObject raw = read(c);
                    if (raw == null || (!manual && !raw.optBoolean("enabled")) || stopped.get()
                            || (manual && (requestId.isEmpty() || !requestId.equals(p.getString("manualRequestId", ""))))) return false;
                    if (!manual && day.equals(p.getString("lastDay", ""))) return false;
                    config = new OssConfig(raw);
                    generation = config.generation; started = true;
                    p.edit().putBoolean("running", true).putLong("started", System.currentTimeMillis()).putString("lastError", "").apply();
                    if (manual) p.edit().putString("manualState", "running").putString("manualError", "").apply();
                }
                JSONObject state;
                try (EncryptedStore store = new EncryptedStore(c)) { state = store.load(); }
                if (state == null) throw new IllegalArgumentException("尚无已保存数据，请先建立成长档案");
                String space = state.getString("spaceId"), device = state.getString("deviceId");
                if (!space.matches("[A-Za-z0-9-]{1,80}") || !device.matches("[A-Za-z0-9-]{1,80}")) throw new IllegalArgumentException("空间标识无效，请先导出本地备份");
                byte[] bytes = PortableBackup.encrypt(state, config.recoveryCode, Instant.now().toString());
                String key = "growth-blueprint/" + space + "/" + device + "/" + day + ".gbp";
                OssClient.Cancellation cancellation = () -> {
                    if (stopped.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    JSONObject current = read(c);
                    if (current == null || (!manual && !current.optBoolean("enabled")) || !config.generation.equals(current.optString("generation"))
                            || (manual && !requestId.equals(p.getString("manualRequestId", "")))) throw new InterruptedException();
                };
                client.uploadVerified(config, key, bytes, cancellation);
                synchronized (CONFIG) {
                    cancellation.check();
                    String at = Instant.now().toString();
                    SharedPreferences.Editor result = p.edit().putString("lastSuccessAt", at).putString("lastDay", day)
                            .putString("lastObjectKey", key).putLong("lastRevision", state.getLong("revision")).putString("lastError", "");
                    if (manual) result.putString("manualState", "success").putString("manualSuccessAt", at).putString("manualError", "");
                    result.apply();
                }
                return false;
            } catch (InterruptedException e) {
                synchronized (CONFIG) {
                    if (manual && requestId.equals(p.getString("manualRequestId", ""))) p.edit().putString("manualState", "queued").apply();
                }
                return true;
            }
            catch (IllegalArgumentException e) { recordFailure(c, generation, manual, requestId, e.getMessage()); return false; }
            catch (Exception e) {
                String message = e.getMessage();
                if (message == null || !(message.startsWith("HTTP ") || message.startsWith("云端回读") || message.startsWith("云端备份")))
                    message = "连接或加密备份失败，请检查网络、OSS 配置及可用空间；系统将稍后重试";
                recordFailure(c, generation, manual, requestId, message); return true;
            } finally { if (started) p.edit().putBoolean("running", false).apply(); }
        }
    }
    private static void recordFailure(Context c, String generation, boolean manual, String requestId, String message) {
        synchronized (CONFIG) {
            try {
                JSONObject current = read(c); SharedPreferences p = statusPrefs(c);
                if (current == null || !current.optString("generation").equals(generation)
                        || (!manual && !current.optBoolean("enabled"))
                        || (manual && !requestId.equals(p.getString("manualRequestId", "")))) return;
                SharedPreferences.Editor result = p.edit().putString("lastError", message);
                if (manual) result.putString("manualState", "failed").putString("manualError", message).putString("manualSuccessAt", "");
                result.apply();
            } catch (Exception ignored) { /* Never restore stale status after credentials were removed or replaced. */ }
        }
    }
}
