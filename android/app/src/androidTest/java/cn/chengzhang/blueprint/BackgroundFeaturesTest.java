package cn.chengzhang.blueprint;

import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BackgroundFeaturesTest {
    private Context context;
    private JSONObject config() throws Exception {
        return new JSONObject().put("bucket", "blueprint-test-only").put("region", "cn-hangzhou")
                .put("accessKeyId", "TestOnlyAccessKey1234").put("accessKeySecret", "TestOnlySecret1234")
                .put("recoveryCode", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").put("generation", "test-generation").put("enabled", true);
    }
    @Before public void before() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSystemService(JobScheduler.class).cancelAll(); SecureSettings.erase(context);
        context.getSharedPreferences("oss-backup-status", 0).edit().clear().commit();
        context.getSharedPreferences("plan-reminder-deliveries", 0).edit().clear().commit();
        context.getSystemService(NotificationManager.class).cancelAll(); context.deleteDatabase("blueprint-v1.db");
    }
    @After public void after() throws Exception {
        context.getSystemService(JobScheduler.class).cancelAll(); SecureSettings.erase(context);
        context.getSystemService(NotificationManager.class).cancelAll(); context.deleteDatabase("blueprint-v1.db");
    }
    @Test public void credentialsAreKeystoreEncryptedAndStatusNeverReturnsSecrets() throws Exception {
        new SecureSettings(context).write(config());
        assertEquals("TestOnlySecret1234", new SecureSettings(context).read().getString("accessKeySecret"));
        byte[] bytes = Files.readAllBytes(new java.io.File(context.getNoBackupFilesDir(), "oss-settings.enc").toPath());
        assertFalse(new String(bytes, StandardCharsets.UTF_8).contains("TestOnly"));
        String status = CloudBackup.status(context).toString(); assertFalse(status.contains("TestOnly"));
        assertFalse(status.contains(config().getString("recoveryCode")));
        assertTrue(CloudBackup.status(context).getString("lastSuccessAt").isEmpty());
    }
    @Test public void dailyJobIsPersistedAndNetworkConstrainedAndDisableCancelsIt() throws Exception {
        new SecureSettings(context).write(config()); CloudBackup.ensureScheduled(context);
        JobInfo job = context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB);
        assertNotNull(job); assertTrue(job.isPersisted()); assertTrue(job.isPeriodic());
        assertEquals(86400000L, job.getIntervalMillis()); assertEquals(JobInfo.NETWORK_TYPE_ANY, job.getNetworkType());
        CloudBackup.disable(context); assertNull(context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB));
        assertFalse(CloudBackup.status(context).getBoolean("enabled"));
    }
    @Test public void damagedSettingsFailClosedAndCanBeExplicitlyRemoved() throws Exception {
        new SecureSettings(context).write(config());
        java.io.File file = new java.io.File(context.getNoBackupFilesDir(), "oss-settings.enc"); byte[] bytes = Files.readAllBytes(file.toPath());
        bytes[bytes.length - 1] ^= 1; Files.write(file.toPath(), bytes);
        try { new SecureSettings(context).read(); fail("must reject corrupt settings"); } catch (javax.crypto.AEADBadTagException expected) { }
        CloudBackup.forget(context); assertFalse(file.exists()); assertFalse(CloudBackup.status(context).getBoolean("configured"));
    }
    private JSONObject state(int revision) throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("revision", revision).put("spaceId", "test-space").put("deviceId", "test-device")
                .put("operations", new JSONArray()).put("content", "机密备份内容");
    }
    private String manualRequest() {
        String id = java.util.UUID.randomUUID().toString();
        context.getSharedPreferences("oss-backup-status", 0).edit().putString("manualRequestId", id)
                .putString("manualState", "queued").putString("manualSuccessAt", "").apply();
        return id;
    }
    private OssClient transport(AtomicReference<byte[]> remote, boolean tamper) {
        return transport(remote, tamper, () -> {});
    }
    private OssClient transport(AtomicReference<byte[]> remote, boolean tamper, Runnable uploaded) {
        return new OssClient(url -> new HttpURLConnection(url) {
            @Override public void disconnect() { }
            @Override public boolean usingProxy() { return false; }
            @Override public void connect() { }
            @Override public int getResponseCode() { return 200; }
            @Override public OutputStream getOutputStream() {
                return new ByteArrayOutputStream() { @Override public void close() { remote.set(toByteArray()); uploaded.run(); } };
            }
            @Override public InputStream getInputStream() { return new ByteArrayInputStream(tamper ? new byte[]{1} : remote.get()); }
        });
    }
    @Test public void backgroundUploadReadsEncryptedStoreAndMarksSuccessOnlyAfterVerification() throws Exception {
        new SecureSettings(context).write(config());
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        AtomicReference<byte[]> remote = new AtomicReference<>();
        assertFalse(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), transport(remote, false)));
        JSONObject status = CloudBackup.status(context); assertFalse(status.getString("lastSuccessAt").isEmpty());
        assertEquals(1, status.getLong("lastRevision")); assertFalse(new String(remote.get(), StandardCharsets.UTF_8).contains("机密"));
        assertEquals("success", status.getString("manualState")); assertEquals(status.getString("lastSuccessAt"), status.getString("manualSuccessAt"));
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(2).toString(), 1); }
        assertTrue(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), transport(remote, true)));
        assertEquals(1, CloudBackup.status(context).getLong("lastRevision"));
        assertTrue(CloudBackup.status(context).getString("lastError").contains("校验失败"));
        assertEquals("failed", CloudBackup.status(context).getString("manualState"));
        assertTrue(CloudBackup.status(context).getString("manualSuccessAt").isEmpty());
    }
    @Test public void noDataOrDisabledAutomaticBackupNeverSendsNetworkRequests() throws Exception {
        new SecureSettings(context).write(config());
        OssClient forbidden = new OssClient(url -> { throw new AssertionError("must not connect"); });
        assertFalse(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), forbidden));
        assertTrue(CloudBackup.status(context).getString("lastSuccessAt").isEmpty());
        CloudBackup.disable(context);
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        assertFalse(CloudBackup.perform(context, false, "", new AtomicBoolean(), forbidden));
    }
    @Test public void savingConfigurationPreservesSwitchAndFirstSetupDefaultsOff() throws Exception {
        CloudBackup.configure(context, config().put("recoverySaved", true));
        assertFalse(CloudBackup.status(context).getBoolean("enabled"));
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB));
        CloudBackup.setEnabled(context, true);
        assertNotNull(context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB));
        CloudBackup.configure(context, config());
        assertTrue(CloudBackup.status(context).getBoolean("enabled"));
        CloudBackup.disable(context); CloudBackup.configure(context, config());
        assertFalse(CloudBackup.status(context).getBoolean("enabled"));
    }
    @Test public void manualJobIsIndependentAndDisablingOnlyCancelsAutomaticJobs() throws Exception {
        new SecureSettings(context).write(config()); CloudBackup.catchUp(context);
        String request = CloudBackup.enqueue(context);
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo manual = scheduler.getPendingJob(CloudBackup.NOW_JOB);
        assertNotNull(manual); assertTrue(manual.isPersisted()); assertEquals(request, manual.getExtras().getString("requestId"));
        assertEquals(request, CloudBackup.enqueue(context));
        CloudBackup.disable(context);
        assertNull(scheduler.getPendingJob(CloudBackup.DAILY_JOB)); assertNull(scheduler.getPendingJob(CloudBackup.CATCH_UP_JOB));
        assertNotNull(scheduler.getPendingJob(CloudBackup.NOW_JOB));
        assertEquals(request, CloudBackup.enqueue(context));
        CloudBackup.forget(context); assertNull(scheduler.getPendingJob(CloudBackup.NOW_JOB));
    }
    @Test public void rejectedSchedulerRollsBackAutomaticSwitch() throws Exception {
        new SecureSettings(context).write(config().put("enabled", false));
        AtomicBoolean rejected = new AtomicBoolean();
        Context unavailable = new android.content.ContextWrapper(context) {
            @Override public Object getSystemService(String name) {
                if (Context.JOB_SCHEDULER_SERVICE.equals(name) && !rejected.getAndSet(true)) throw new IllegalStateException("test-scheduler-rejection");
                return super.getSystemService(name);
            }
        };
        try { CloudBackup.setEnabled(unavailable, true); fail("must report scheduling failure"); }
        catch (IllegalStateException expected) { assertEquals("test-scheduler-rejection", expected.getMessage()); }
        assertFalse(CloudBackup.status(context).getBoolean("enabled"));
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB));
    }
    @Test public void manualBackupWorksWithAutomaticSwitchOff() throws Exception {
        new SecureSettings(context).write(config().put("enabled", false));
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        assertFalse(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), transport(new AtomicReference<>(), false)));
        JSONObject status = CloudBackup.status(context);
        assertFalse(status.getBoolean("enabled")); assertEquals("success", status.getString("manualState"));
        assertFalse(status.getString("manualSuccessAt").isEmpty());
        assertNull(context.getSystemService(JobScheduler.class).getPendingJob(CloudBackup.DAILY_JOB));
    }
    @Test public void automaticSuccessCannotCompleteManualRequestAndStaleRequestCannotUpload() throws Exception {
        new SecureSettings(context).write(config());
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        String stale = manualRequest(), latest = manualRequest();
        assertFalse(CloudBackup.perform(context, false, "", new AtomicBoolean(), transport(new AtomicReference<>(), false)));
        JSONObject status = CloudBackup.status(context);
        assertFalse(status.getString("lastSuccessAt").isEmpty()); assertEquals("queued", status.getString("manualState"));
        assertTrue(status.getString("manualSuccessAt").isEmpty());
        OssClient forbidden = new OssClient(url -> { throw new AssertionError("stale request must not connect"); });
        assertFalse(CloudBackup.perform(context, true, stale, new AtomicBoolean(), forbidden));
        assertEquals(latest, CloudBackup.status(context).getString("manualRequestId"));
    }
    @Test public void switchingOffDuringManualUploadDoesNotCancelVerification() throws Exception {
        new SecureSettings(context).write(config());
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        OssClient client = transport(new AtomicReference<>(), false, () -> {
            try { CloudBackup.disable(context); } catch (Exception e) { throw new AssertionError(e); }
        });
        assertFalse(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), client));
        assertFalse(CloudBackup.status(context).getBoolean("enabled"));
        assertEquals("success", CloudBackup.status(context).getString("manualState"));
    }
    @Test public void switchingOffDuringAutomaticUploadPreventsSuccessMarker() throws Exception {
        new SecureSettings(context).write(config());
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        OssClient client = transport(new AtomicReference<>(), false, () -> {
            try { CloudBackup.disable(context); } catch (Exception e) { throw new AssertionError(e); }
        });
        assertTrue(CloudBackup.perform(context, false, "", new AtomicBoolean(), client));
        assertTrue(CloudBackup.status(context).getString("lastSuccessAt").isEmpty());
    }
    @Test public void removingConfigurationDuringUploadCannotRestoreStaleSuccess() throws Exception {
        new SecureSettings(context).write(config());
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(state(1).toString(), 0); }
        OssClient client = transport(new AtomicReference<>(), false, () -> {
            try { CloudBackup.forget(context); } catch (Exception e) { throw new AssertionError(e); }
        });
        assertTrue(CloudBackup.perform(context, true, manualRequest(), new AtomicBoolean(), client));
        JSONObject status = CloudBackup.status(context);
        assertFalse(status.getBoolean("configured")); assertTrue(status.getString("manualState").isEmpty());
        assertTrue(status.getString("lastSuccessAt").isEmpty());
    }
    private void waitForCount(int expected) throws Exception {
        for (int i = 0; i < 40; i++) {
            if (context.getSystemService(NotificationManager.class).getActiveNotifications().length == expected) return;
            Thread.sleep(100);
        }
        assertEquals(expected, context.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
    @Test public void duePlanNotifiesOnceAndCompletingItCancelsVisibleNotification() throws Exception {
        assertTrue("Grant POST_NOTIFICATIONS to the test installation before running", PlanReminders.allowed(context));
        ZoneId zone = ZoneId.of("Asia/Shanghai"); String date = LocalDate.now(zone).toString();
        String time = LocalTime.now(zone).minusMinutes(1).withSecond(0).withNano(0).toString();
        JSONObject s = state(1).put("persons", new JSONArray().put(new JSONObject().put("id", "p").put("name", "测试人物").put("timezone", "Asia/Shanghai")))
                .put("goals", new JSONArray()).put("instances", new JSONArray()).put("actions", new JSONArray().put(new JSONObject()
                        .put("id", "a").put("personId", "p").put("title", "到时计划").put("date", "2026-01-01").put("createdAt", "2025-01-01T00:00:00Z")
                        .put("reminderTime", time).put("repeat", new JSONObject().put("kind", "daily").put("version", 1))));
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(s.toString(), 0); }
        PlanReminders.reconcile(context); waitForCount(1); PlanReminders.reconcile(context); waitForCount(1);
        String instanceDate = Instant.now().atZone(zone).minusMinutes(1).toLocalDate().toString();
        s.put("revision", 2).getJSONArray("instances").put(new JSONObject().put("id", "a:1:" + instanceDate).put("actionId", "a")
                .put("date", instanceDate).put("done", true).put("completedAt", Instant.now().toString()));
        try (EncryptedStore store = new EncryptedStore(context)) { store.save(s.toString(), 1); }
        PlanReminders.reconcile(context); waitForCount(0);
    }
}
