package cn.chengzhang.blueprint;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONObject;

/** Shares the authenticated .gbp wire format with src/backup.ts, including its AAD. */
final class PortableBackup {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    static byte[] encrypt(JSONObject state, String code, String createdAt) throws Exception {
        if (state.getInt("schemaVersion") != 1) throw new IllegalArgumentException("备份版本不兼容");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(Base64.getUrlDecoder().decode(code), "AES"));
        cipher.updateAAD("GrowthBlueprint/backup/v1".getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(state.toString().getBytes(StandardCharsets.UTF_8));
        byte[] result = new JSONObject().put("format", "GrowthBlueprint").put("version", 1)
                .put("algorithm", "AES-256-GCM").put("iv", Base64.getEncoder().encodeToString(cipher.getIV()))
                .put("data", Base64.getEncoder().encodeToString(ciphertext)).put("createdAt", createdAt)
                .toString().getBytes(StandardCharsets.UTF_8);
        if (result.length > MAX_BYTES) throw new IllegalArgumentException("加密备份超过 20MB，请先导出并精简附件");
        return result;
    }
}
