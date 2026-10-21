package cn.chengzhang.blueprint;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.Instant;
import java.util.Map;

/** TLS, V4 signing and a read-back checksum before a backup can be marked successful. */
final class OssClient {
    interface Connections { HttpURLConnection open(URL url) throws Exception; }
    interface Cancellation { void check() throws Exception; }
    private final Connections connections;
    OssClient() { this(url -> (HttpURLConnection) url.openConnection()); }
    OssClient(Connections connections) { this.connections = connections; }
    private void request(OssConfig config, String method, String key, byte[] body, ByteArrayOutputStream output, Cancellation cancellation) throws Exception {
        cancellation.check();
        HttpURLConnection connection = connections.open(new URL(config.endpoint() + "/" + key));
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000); connection.setReadTimeout(30000);
            connection.setRequestMethod(method); connection.setRequestProperty("Accept-Encoding", "identity");
            for (Map.Entry<String,String> h : OssSigner.headers(config, method, key, body, Instant.now()).entrySet())
                connection.setRequestProperty(h.getKey(), h.getValue());
            if (body != null) {
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream stream = connection.getOutputStream()) {
                    for (int at = 0; at < body.length; at += 65536) {
                        cancellation.check(); stream.write(body, at, Math.min(65536, body.length - at));
                    }
                }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String message = status == 403 ? "请检查 RAM 密钥、目录读写权限及设备时间" :
                        status == 404 ? "Bucket 或备份文件不存在" :
                        status >= 300 && status < 400 ? "请检查 Bucket 所在地域；不会跟随重定向发送凭据" :
                        status == 429 || status >= 500 ? "OSS 暂时繁忙，将稍后重试" : "OSS 请求未成功，请检查配置";
                throw new java.io.IOException("HTTP " + status + "：" + message);
            }
            if (output != null) try (InputStream stream = connection.getInputStream()) {
                byte[] chunk = new byte[65536]; int n;
                while ((n = stream.read(chunk)) != -1) {
                    cancellation.check();
                    if (output.size() + n > PortableBackup.MAX_BYTES) throw new java.io.IOException("云端备份超过 20MB");
                    output.write(chunk, 0, n);
                }
            }
            cancellation.check();
        } finally { connection.disconnect(); }
    }
    void uploadVerified(OssConfig config, String key, byte[] body, Cancellation cancellation) throws Exception {
        request(config, "PUT", key, body, null, cancellation);
        ByteArrayOutputStream downloaded = new ByteArrayOutputStream();
        request(config, "GET", key, null, downloaded, cancellation);
        if (!java.security.MessageDigest.isEqual(
                java.security.MessageDigest.getInstance("SHA-256").digest(body),
                java.security.MessageDigest.getInstance("SHA-256").digest(downloaded.toByteArray())))
            throw new java.io.IOException("云端回读校验失败，本次未记为备份成功");
    }
}
