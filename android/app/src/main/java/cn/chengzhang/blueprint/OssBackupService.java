package cn.chengzhang.blueprint;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** OS-persisted, network-constrained daily work; no Activity or WebView is required. */
public final class OssBackupService extends JobService {
    private final ConcurrentHashMap<Integer, AtomicBoolean> tasks = new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters parameters) {
        AtomicBoolean stopped = new AtomicBoolean(); tasks.put(parameters.getJobId(), stopped);
        new Thread(() -> {
            boolean retry = CloudBackup.perform(getApplicationContext(), parameters.getJobId() == CloudBackup.NOW_JOB,
                    parameters.getExtras().getString("requestId", ""), stopped);
            if (tasks.remove(parameters.getJobId(), stopped) && !stopped.get()) jobFinished(parameters, retry);
        }, "oss-daily-backup").start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        AtomicBoolean stopped = tasks.remove(parameters.getJobId()); if (stopped != null) stopped.set(true);
        return true;
    }
}
