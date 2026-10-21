package cn.chengzhang.blueprint;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** OSS V4 header authentication. Only object GET/PUT without query parameters are supported. */
final class OssSigner {
    static String sha256(byte[] data) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(data)); }
    private static String hex(byte[] data) {
        StringBuilder result = new StringBuilder();
        for (byte b : data) result.append(String.format(Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
    private static byte[] hmac(byte[] key, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }
    static Map<String,String> headers(OssConfig config, String method, String objectKey, byte[] body, Instant now) throws Exception {
        if (!objectKey.matches("[A-Za-z0-9/_.-]+") || objectKey.contains("..")) throw new IllegalArgumentException("备份路径无效");
        String stamp = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(now);
        String date = stamp.substring(0, 8);
        TreeMap<String,String> headers = new TreeMap<>();
        headers.put("x-oss-date", stamp);
        headers.put("x-oss-content-sha256", "UNSIGNED-PAYLOAD");
        if (body != null) {
            headers.put("content-type", "application/octet-stream");
            headers.put("content-md5", java.util.Base64.getEncoder().encodeToString(MessageDigest.getInstance("MD5").digest(body)));
            headers.put("x-oss-meta-sha256", sha256(body));
        }
        StringBuilder canonicalHeaders = new StringBuilder();
        for (Map.Entry<String,String> h : headers.entrySet()) canonicalHeaders.append(h.getKey()).append(':').append(h.getValue()).append('\n');
        // OSS canonical URI contains the bucket even when requests use a virtual-host endpoint.
        String canonical = method + "\n/" + config.bucket + "/" + objectKey + "\n\n" + canonicalHeaders + "\n\nUNSIGNED-PAYLOAD";
        String scope = date + "/" + config.region + "/oss/aliyun_v4_request";
        String toSign = "OSS4-HMAC-SHA256\n" + stamp + "\n" + scope + "\n" + sha256(canonical.getBytes(StandardCharsets.UTF_8));
        byte[] key = hmac(("aliyun_v4" + config.accessKeySecret).getBytes(StandardCharsets.UTF_8), date);
        key = hmac(key, config.region); key = hmac(key, "oss"); key = hmac(key, "aliyun_v4_request");
        headers.put("Authorization", "OSS4-HMAC-SHA256 Credential=" + config.accessKeyId + "/" + scope + ",Signature=" + hex(hmac(key, toSign)));
        return headers;
    }
}
