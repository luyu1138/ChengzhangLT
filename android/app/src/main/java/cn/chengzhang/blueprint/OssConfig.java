package cn.chengzhang.blueprint;

import java.util.Base64;
import org.json.JSONObject;

/** Personal RAM credentials only; never serialized into a business snapshot. */
final class OssConfig {
    final String bucket, region, accessKeyId, accessKeySecret, recoveryCode, generation;
    OssConfig(JSONObject value) throws Exception {
        bucket = value.getString("bucket").trim();
        region = value.getString("region").trim();
        accessKeyId = value.getString("accessKeyId").trim();
        accessKeySecret = value.getString("accessKeySecret").trim();
        recoveryCode = value.getString("recoveryCode").trim();
        generation = value.getString("generation");
        if (!bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]") ||
                !region.matches("[a-z]{2}-[a-z][a-z0-9-]{1,30}") ||
                !accessKeyId.matches("[A-Za-z0-9]{8,128}") ||
                !accessKeySecret.matches("[A-Za-z0-9+/=_-]{8,256}"))
            throw new IllegalArgumentException("请检查 Bucket、地域及 RAM AccessKey 格式；地域示例：cn-hangzhou");
        if (!recoveryCode.matches("[A-Za-z0-9_-]{43}") || Base64.getUrlDecoder().decode(recoveryCode).length != 32)
            throw new IllegalArgumentException("请保存完整的 43 位备份恢复码");
    }
    String endpoint() { return "https://" + bucket + ".oss-" + region + ".aliyuncs.com"; }
}
