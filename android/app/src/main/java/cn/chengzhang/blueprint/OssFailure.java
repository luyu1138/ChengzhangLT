package cn.chengzhang.blueprint;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Exposes only public error codes and validated request IDs, never OSS's reflected request/signature. */
final class OssFailure extends IOException {
    static final int MAX_ERROR_BYTES = 64 * 1024;
    private static final Set<String> CODES = new HashSet<>(Arrays.asList(
            "AccessDenied", "AccessForbidden", "InvalidAccessKeyId", "SignatureDoesNotMatch",
            "RequestTimeTooSkewed", "RequestHasExpired", "RequestExpired", "AuthorizationHeaderMalformed",
            "InvalidArgument", "InvalidSecurityToken", "SecurityTokenExpired", "UserDisable",
            "AccountProblem", "QuotaExceeded", "NoSuchBucket", "NoSuchKey", "InvalidBucketName",
            "InvalidRegion", "ServiceUnavailable", "InternalError", "SlowDown", "RequestTimeout"));
    final int status;
    final String code, requestId, method;
    private OssFailure(int status, String method, String code, String requestId) {
        super(message(status, method, code, requestId));
        this.status = status; this.method = method; this.code = code; this.requestId = requestId;
    }
    static OssFailure from(OssConfig config, String method, int status, HttpURLConnection connection) {
        String body = "";
        // OSS error XML may contain AccessKeyId, StringToSign and signatures. Never return the body/Message.
        try (InputStream input = connection.getErrorStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (input != null) {
                byte[] chunk = new byte[4096]; int n;
                while (out.size() < MAX_ERROR_BYTES && (n = input.read(chunk, 0, Math.min(chunk.length, MAX_ERROR_BYTES - out.size()))) != -1) out.write(chunk, 0, n);
                body = new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) { /* An unreadable body must not replace the known HTTP failure. */ }
        String code = field(body, "Code");
        if (!CODES.contains(code) || sensitive(code, config)) code = "";
        String requestId = "";
        try { requestId = reference(connection.getHeaderField("x-oss-request-id"), config); }
        catch (RuntimeException ignored) { /* Keep the HTTP failure even if response metadata is unreadable. */ }
        if (requestId.isEmpty()) requestId = reference(field(body, "RequestId"), config);
        return new OssFailure(status, method, code, requestId);
    }
    private static String field(String body, String name) {
        // Bounded plain-text extraction deliberately performs no XML/entity evaluation.
        Matcher match = Pattern.compile("<" + name + ">\\s*([A-Za-z0-9-]{1,128})\\s*</" + name + ">").matcher(body);
        return match.find() ? match.group(1) : "";
    }
    private static boolean sensitive(String value, OssConfig config) {
        for (String secret : new String[]{config.accessKeyId, config.accessKeySecret, config.recoveryCode})
            if (value.contains(secret)) return true;
        return false;
    }
    private static String reference(String value, OssConfig config) {
        return value != null && value.matches("[A-Fa-f0-9]{16,64}") && !sensitive(value, config) ? value : "";
    }
    private static String message(int status, String method, String code, String requestId) {
        String phase = "PUT".equals(method) ? "上传（PUT）" : "下载校验（GET）";
        String advice;
        switch (code) {
            case "AccessDenied": case "AccessForbidden":
                advice = "检查这组密钥所属 RAM 用户对备份目录的 " + ("PUT".equals(method) ? "oss:PutObject" : "oss:GetObject") + " 权限，以及 Bucket Policy、访问来源限制。"; break;
            case "InvalidAccessKeyId": advice = "AccessKey ID 不存在或已停用，请核对 RAM 用户的有效密钥。"; break;
            case "SignatureDoesNotMatch": advice = "签名不匹配，请核对配套的 AccessKey ID/Secret 和 Bucket 实际地域；配置无误时可用请求编号进一步排查签名。"; break;
            case "RequestTimeTooSkewed": case "RequestHasExpired": case "RequestExpired": advice = "设备时间与服务器不一致，请开启手机的自动日期时间后重试。"; break;
            case "AuthorizationHeaderMalformed": case "InvalidRegion": advice = "授权信息或签名地域无效，请按 Bucket 概览填写实际地域代码。"; break;
            case "InvalidSecurityToken": case "SecurityTokenExpired": advice = "临时授权无效或已过期；此版本请使用专用 RAM 用户的 AccessKey。"; break;
            case "UserDisable": case "AccountProblem": advice = "请在阿里云控制台检查账号、OSS 开通及欠费状态。"; break;
            case "QuotaExceeded": advice = "请检查 OSS 账号配额和可用容量。"; break;
            case "NoSuchBucket": case "InvalidBucketName": advice = "请核对 Bucket 名称及实际所属地域。"; break;
            case "NoSuchKey": advice = "云端回读文件不存在，本次没有记为备份成功。"; break;
            case "InvalidArgument": advice = "OSS 请求参数无效，请核对 Bucket 配置和地域。"; break;
            default:
                advice = status == 403 ? "请检查 RAM 密钥、目录读写权限、Bucket 策略、地域及设备时间。" :
                        status >= 300 && status < 400 ? "请核对 Bucket 所在地域；不会跟随重定向发送凭据。" :
                        status == 429 || status >= 500 ? "OSS 暂时繁忙，将稍后重试。" : "OSS 请求未成功，请核对配置。";
        }
        return "HTTP " + status + " · " + phase + (code.isEmpty() ? "" : " · " + code) + "：" + advice
                + (requestId.isEmpty() ? "" : "\n请求编号：" + requestId);
    }
}
