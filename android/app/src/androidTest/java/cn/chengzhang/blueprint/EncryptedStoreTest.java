package cn.chengzhang.blueprint;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class EncryptedStoreTest {
    private Context context;
    private EncryptedStore store;
    @Before public void setUp() throws Exception {context=InstrumentationRegistry.getInstrumentation().getTargetContext();context.deleteDatabase("blueprint-v1.db");store=new EncryptedStore(context);}
    @After public void tearDown(){store.close();context.deleteDatabase("blueprint-v1.db");}
    private JSONObject state(int revision) throws Exception {return new JSONObject().put("schemaVersion",1).put("revision",revision).put("content","机密成长记录-不得明文落盘").put("operations",new JSONArray().put(new JSONObject().put("id","op-"+revision).put("seq",revision).put("text","机密日志")));}
    @Test public void survivesCloseAndReopenWithEncryptedOutbox() throws Exception {
        JSONObject state=state(1);store.save(state.toString(),0);store.close();store=new EncryptedStore(context);
        assertEquals("机密成长记录-不得明文落盘",store.load().getString("content"));
        try(Cursor c=store.getReadableDatabase().rawQuery("SELECT nonce,ciphertext FROM snapshot",null)){assertTrue(c.moveToFirst());assertEquals(12,c.getBlob(0).length);assertFalse(new String(c.getBlob(1),StandardCharsets.UTF_8).contains("机密"));}
        try(Cursor c=store.getReadableDatabase().rawQuery("SELECT ciphertext FROM outbox",null)){assertTrue(c.moveToFirst());assertFalse(new String(c.getBlob(0),StandardCharsets.UTF_8).contains("机密日志"));}
    }
    @Test public void malformedOperationRollsBackSnapshotAndOutbox() throws Exception {
        JSONObject state=state(1);state.getJSONArray("operations").put(new JSONObject().put("id","invalid-missing-seq"));
        try{store.save(state.toString(),0);fail("must reject malformed operation");}catch(Exception expected){}
        assertNull(store.load());try(Cursor c=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM outbox",null)){assertTrue(c.moveToFirst());assertEquals(0,c.getInt(0));}
    }
    @Test public void staleRevisionCannotOverwriteAndNonceIsFresh() throws Exception {
        store.save(state(1).toString(),0);byte[] first;
        try(Cursor c=store.getReadableDatabase().rawQuery("SELECT nonce FROM snapshot",null)){assertTrue(c.moveToFirst());first=c.getBlob(0);}
        try{store.save(state(2).toString(),0);fail("must reject stale revision");}catch(IllegalStateException expected){}
        assertEquals(1,store.load().getInt("revision"));store.save(state(2).toString(),1);
        try(Cursor c=store.getReadableDatabase().rawQuery("SELECT nonce FROM snapshot",null)){assertTrue(c.moveToFirst());assertFalse(Arrays.equals(first,c.getBlob(0)));}
    }
    @Test public void authenticatedCiphertextRejectsCorruption() throws Exception {
        store.save(state(1).toString(),0);SQLiteDatabase db=store.getWritableDatabase();byte[] ciphertext;
        try(Cursor c=db.rawQuery("SELECT ciphertext FROM snapshot",null)){assertTrue(c.moveToFirst());ciphertext=c.getBlob(0);}ciphertext[0]^=1;ContentValues row=new ContentValues();row.put("ciphertext",ciphertext);db.update("snapshot",row,"id=1",null);
        try{store.load();fail("corruption must fail authentication");}catch(javax.crypto.AEADBadTagException expected){}
    }
}
