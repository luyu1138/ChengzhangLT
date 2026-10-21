package cn.chengzhang.blueprint;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** One SQLite transaction commits both the authenticated snapshot and encrypted operation outbox. */
public final class EncryptedStore extends SQLiteOpenHelper {
    private static final String ALIAS = "growth-blueprint-content-v1";
    private final SecretKey key;

    public EncryptedStore(Context context) throws Exception {
        super(context, "blueprint-v1.db", null, 1);
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            // Never silently replace a lost key for an existing database.
            if (context.getDatabasePath("blueprint-v1.db").exists()) throw new IllegalStateException("设备密钥不可用，请保留数据并使用加密备份恢复");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        key = (SecretKey)ks.getKey(ALIAS, null);
        setWriteAheadLoggingEnabled(true);
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL)");
        db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL)");
        db.execSQL("CREATE INDEX outbox_seq ON outbox(seq)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("数据库版本不兼容，禁止覆盖"); }
    private byte[][] encrypt(String value, String context) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key);
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
        return new byte[][]{cipher.getIV(),cipher.doFinal(value.getBytes(StandardCharsets.UTF_8))};
    }
    private String decrypt(byte[] nonce, byte[] ciphertext, String context) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,nonce));
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));return new String(cipher.doFinal(ciphertext),StandardCharsets.UTF_8);
    }
    public synchronized JSONObject load() throws Exception {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT revision,nonce,ciphertext FROM snapshot WHERE id=1",null)) {
            if(!c.moveToFirst()) return null;
            return new JSONObject(decrypt(c.getBlob(1),c.getBlob(2),"GrowthBlueprint/snapshot/v1/"+c.getLong(0)));
        }
    }
    public synchronized void save(String value, long expectedRevision) throws Exception {
        if(value.length()>30*1024*1024) throw new IllegalArgumentException("空间超过当前版本的本地写入上限");
        JSONObject state=new JSONObject(value);
        if(state.getInt("schemaVersion")!=1) throw new IllegalArgumentException("格式版本不兼容");
        long revision=state.getLong("revision"); if(revision<=expectedRevision) throw new IllegalArgumentException("修订号无效");
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            long current=0;
            try(Cursor c=db.rawQuery("SELECT revision FROM snapshot WHERE id=1",null)) { if(c.moveToFirst()) current=c.getLong(0); }
            if(current!=expectedRevision) throw new IllegalStateException("数据已更新，请重新打开后再试");
            byte[][] encrypted=encrypt(value,"GrowthBlueprint/snapshot/v1/"+revision);
            ContentValues row=new ContentValues();row.put("id",1);row.put("revision",revision);row.put("nonce",encrypted[0]);row.put("ciphertext",encrypted[1]);
            db.replaceOrThrow("snapshot",null,row);
            // Reconcile operation IDs so permanent deletion also removes old encrypted log payloads.
            JSONArray operations=state.getJSONArray("operations");
            db.execSQL("CREATE TEMP TABLE IF NOT EXISTS retained_ops (id TEXT PRIMARY KEY)");db.execSQL("DELETE FROM retained_ops");
            for(int i=0;i<operations.length();i++) {
                JSONObject op=operations.getJSONObject(i);String id=op.getString("id");ContentValues retained=new ContentValues();retained.put("id",id);db.insertOrThrow("retained_ops",null,retained);
                boolean exists;
                try(Cursor c=db.rawQuery("SELECT 1 FROM outbox WHERE id=?",new String[]{id})){exists=c.moveToFirst();}
                if(!exists){byte[][] data=encrypt(op.toString(),"GrowthBlueprint/outbox/v1/"+id);ContentValues log=new ContentValues();log.put("id",id);log.put("seq",op.getLong("seq"));log.put("nonce",data[0]);log.put("ciphertext",data[1]);db.insertOrThrow("outbox",null,log);}
            }
            db.execSQL("DELETE FROM outbox WHERE id NOT IN (SELECT id FROM retained_ops)");
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
}
