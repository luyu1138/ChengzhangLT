package cn.chengzhang.blueprint;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.util.Calendar;

/** Inexact, privacy-preserving device reminder; no exact alarm privilege or background networking. */
public final class ReminderReceiver extends BroadcastReceiver {
    private static PendingIntent pending(Context c){return PendingIntent.getBroadcast(c,1,new Intent(c,ReminderReceiver.class).setAction("cn.chengzhang.blueprint.REMIND"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void configure(Context c,int hour,int minute){c.getSharedPreferences("reminder",0).edit().putBoolean("enabled",true).putInt("hour",hour).putInt("minute",minute).apply();schedule(c);}
    private static void schedule(Context c){SharedPreferences p=c.getSharedPreferences("reminder",0);if(!p.getBoolean("enabled",false))return;Calendar next=Calendar.getInstance();next.set(Calendar.HOUR_OF_DAY,p.getInt("hour",20));next.set(Calendar.MINUTE,p.getInt("minute",30));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);if(next.getTimeInMillis()<=System.currentTimeMillis())next.add(Calendar.DATE,1);c.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pending(c));}
    static void cancel(Context c){c.getSharedPreferences("reminder",0).edit().putBoolean("enabled",false).apply();c.getSystemService(AlarmManager.class).cancel(pending(c));}
    @Override public void onReceive(Context context,Intent intent){if(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())){schedule(context);return;}if(!context.getSharedPreferences("reminder",0).getBoolean("enabled",false))return;NotificationManager manager=context.getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("growth-daily","每日成长提醒",NotificationManager.IMPORTANCE_DEFAULT));PendingIntent open=PendingIntent.getActivity(context,2,new Intent(context,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);Notification notification=new Notification.Builder(context,"growth-daily").setSmallIcon(cn.chengzhang.blueprint.R.drawable.ic_notification).setContentTitle("留一点时间，关心自己的成长").setContentText("看看今天的行动，或记下一条新的收获。").setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();try{manager.notify(100,notification);}catch(SecurityException ignored){}schedule(context);}
}
