package cn.chengzhang.blueprint;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import java.time.Instant;
import org.json.JSONObject;

final class PlanReminders {
    static final String ACTION = "cn.chengzhang.blueprint.PLAN_REMINDER";
    private static final java.util.concurrent.ExecutorService QUEUE = java.util.concurrent.Executors.newSingleThreadExecutor();
    static void refresh(Context c) { Context app = c.getApplicationContext(); QUEUE.execute(() -> { try { reconcile(app); } catch (Exception ignored) { /* Encrypted source is preserved; retry on the next save/start/boot. */ } }); }
    private static PendingIntent pending(Context c) { return PendingIntent.getBroadcast(c, 40, new Intent(c, PlanReminderReceiver.class).setAction(ACTION), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT); }
    static boolean allowed(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel("growth-plans");
        return (Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
                && manager.areNotificationsEnabled() && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }
    static boolean exact(Context c) { return Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager.class).canScheduleExactAlarms(); }
    static synchronized void reconcile(Context c) throws Exception {
        JSONObject state; try (EncryptedStore store = new EncryptedStore(c)) { state = store.load(); }
        AlarmManager alarms = c.getSystemService(AlarmManager.class); alarms.cancel(pending(c)); if (state == null) return;
        long now = System.currentTimeMillis(), next = now + 24L * 60 * 60 * 1000;
        android.content.SharedPreferences p = c.getSharedPreferences("plan-reminder-deliveries", 0);
        android.content.SharedPreferences.Editor changes = p.edit();
        for (java.util.Map.Entry<String,?> old : p.getAll().entrySet()) if (old.getValue() instanceof Long && now - (Long) old.getValue() > 7L * 86400000) changes.remove(old.getKey());
        NotificationManager notifications = c.getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("growth-plans", "个人固定计划", NotificationManager.IMPORTANCE_DEFAULT));
        java.util.List<ReminderRules.Occurrence> upcoming = ReminderRules.upcoming(state, Instant.ofEpochMilli(now));
        java.util.Set<String> activeIds = new java.util.HashSet<>();
        for (ReminderRules.Occurrence item : upcoming) activeIds.add("plan:" + item.id);
        for (android.service.notification.StatusBarNotification notification : notifications.getActiveNotifications())
            if (notification.getTag() != null && notification.getTag().startsWith("plan:") && !activeIds.contains(notification.getTag()))
                notifications.cancel(notification.getTag(), notification.getId());
        int delivered = 0;
        for (ReminderRules.Occurrence item : upcoming) {
            String deliveryKey = item.id + "@" + item.at;
            if (p.contains(deliveryKey)) continue;
            if (item.at > now) { next = Math.min(next, item.at); continue; }
            if (!allowed(c) || delivered >= 20) continue;
            PendingIntent open = PendingIntent.getActivity(c, item.id.hashCode(), new Intent(c, MainActivity.class)
                    .putExtra("openActions", true).putExtra("openPersonId", item.personId).putExtra("openDate", item.date), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification publicVersion = new Notification.Builder(c, "growth-plans").setSmallIcon(R.drawable.ic_notification).setContentTitle("成长蓝图计划提醒").setContentText("有一项计划到时间了").build();
            Notification notification = new Notification.Builder(c, "growth-plans").setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(item.person + "的计划").setContentText(item.title).setContentIntent(open).setAutoCancel(true)
                    .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion).build();
            try { notifications.notify("plan:" + item.id, 0, notification); changes.putLong(deliveryKey, now); delivered++; }
            catch (SecurityException ignored) { }
        }
        changes.apply();
        // A daily check also discovers monthly/interval occurrences beyond the current look-ahead window.
        if (delivered >= 20) next = Math.min(next, now + 60000);
        try { if (exact(c)) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending(c));
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending(c)); }
        catch (SecurityException denied) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending(c)); }
    }
}
