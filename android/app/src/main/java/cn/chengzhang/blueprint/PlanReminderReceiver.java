package cn.chengzhang.blueprint;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class PlanReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync(); Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                PlanReminders.reconcile(app);
                if (!PlanReminders.ACTION.equals(intent.getAction())) CloudBackup.catchUp(app);
            } catch (Exception ignored) { /* Do not log plaintext data or credentials. */ }
            finally { result.finish(); }
        }, "plan-reminder-receiver").start();
    }
}
