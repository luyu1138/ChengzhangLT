package cn.chengzhang.blueprint;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Credentials and recovery material are encrypted separately from exported user data. */
final class SecureSettings {
    private static final String ALIAS = "growth-blueprint-oss-settings-v1";
    private static final byte[] AAD = "GrowthBlueprint/oss-settings/v1".getBytes(StandardCharsets.UTF_8);
    private final AtomicFile file;
    private final SecretKey key;
    SecureSettings(Context context) throws Exception {
        File path = new File(context.getNoBackupFilesDir(), "oss-settings.enc"); file = new AtomicFile(path);
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            if (path.exists() || new File(path + ".bak").exists()) throw new IllegalStateException("OSS 配置密钥不可用，请重新配置");
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        key = (SecretKey) store.getKey(ALIAS, null);
    }
    JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return null;
        byte[] data = file.readFully();
        if (data.length < 28) throw new IllegalStateException("OSS 配置损坏，请重新配置");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, java.util.Arrays.copyOfRange(data, 0, 12)));
        cipher.updateAAD(AAD);
        return new JSONObject(new String(cipher.doFinal(java.util.Arrays.copyOfRange(data, 12, data.length)), StandardCharsets.UTF_8));
    }
    void write(JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key); cipher.updateAAD(AAD);
        byte[] data = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        FileOutputStream output = null;
        try { output = file.startWrite(); output.write(cipher.getIV()); output.write(data); file.finishWrite(output); }
        catch (Exception error) { file.failWrite(output); throw error; }
    }
    void delete() { file.delete(); }
    static void erase(Context context) { new AtomicFile(new File(context.getNoBackupFilesDir(), "oss-settings.enc")).delete(); }
}
