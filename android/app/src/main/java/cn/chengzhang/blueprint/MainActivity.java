package cn.chengzhang.blueprint;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintManager;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.HashMap;
import java.util.Collections;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String HOST="appassets.androidplatform.net";
    private static final int EXPORT=10, IMPORT=11, ATTACHMENT=12;
    private WebView web;
    private volatile EncryptedStore store;
    private volatile boolean destroyed;
    private byte[] pendingExport;
    private boolean fileBusy;
    private int reminderHour=20, reminderMinute=30;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        android.content.pm.PackageInfo engine=WebView.getCurrentWebViewPackage();
        if(engine==null||engine.versionName==null||Integer.parseInt(engine.versionName.split("\\.")[0])<110){new AlertDialog.Builder(this).setTitle("需要更新浏览组件").setMessage("请先将 Android System WebView 或 Chrome 更新到 110 或更高版本，再打开成长蓝图。现有数据不会修改。").setPositiveButton("关闭",(dialog,which)->finish()).setCancelable(false).show();return;}
        web=new WebView(this);setContentView(web);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setTextZoom(Math.round(getResources().getConfiguration().fontScale*100));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !HOST.equals(request.getUrl().getHost());}
            @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail){
                web=null;
                android.widget.LinearLayout recovery=new android.widget.LinearLayout(MainActivity.this);recovery.setOrientation(android.widget.LinearLayout.VERTICAL);recovery.setGravity(android.view.Gravity.CENTER);int margin=(int)(28*getResources().getDisplayMetrics().density);recovery.setPadding(margin,margin,margin,margin);
                android.widget.TextView message=new android.widget.TextView(MainActivity.this);message.setText("显示组件已停止\n\n已保存的数据仍在本机。可以重新打开后重试；若重复出现，请更新 Android System WebView 或 Chrome。");message.setTextSize(18);message.setGravity(android.view.Gravity.CENTER);recovery.addView(message);
                android.widget.Button retry=new android.widget.Button(MainActivity.this);retry.setText("重新打开");retry.setOnClickListener(v->recreate());recovery.addView(retry);setContentView(recovery);view.removeJavascriptInterface("BlueprintNative");view.destroy();return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();String path=uri.getPath();
                if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost())||path==null||path.contains(".."))return blocked();
                if(path.equals("/"))path="/index.html";
                try{String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".html")?"text/html":"application/octet-stream";
                    Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
                    return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open("web"+path));
                }catch(Exception e){return blocked();}
            }
        });
        web.addJavascriptInterface(new NativeBridge(),"BlueprintNative");
        web.loadUrl("https://"+HOST+"/index.html");
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private String failure(String message){try{return new JSONObject().put("ok",false).put("message",message).toString();}catch(Exception ignored){return "{\"ok\":false}";}}
    private String ok(){return "{\"ok\":true}";}
    private void emit(String event,JSONObject detail){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(event)+",{detail:"+detail.toString()+"}))",null);});}
    private synchronized EncryptedStore getStore() throws Exception {
        if(destroyed)throw new IllegalStateException("页面已关闭，请重新打开");
        if(store==null){EncryptedStore opened=new EncryptedStore(MainActivity.this);if(destroyed){opened.close();throw new IllegalStateException("页面已关闭");}store=opened;}
        return store;
    }
    public final class NativeBridge {
        @JavascriptInterface public void closeApp(){runOnUiThread(()->finish());}
        @JavascriptInterface public String load(){try{return new JSONObject().put("ok",true).put("state",getStore().load()).toString();}catch(Exception e){return failure("本地数据无法解密，请保留原数据并使用有效备份恢复");}}
        @JavascriptInterface public String save(String state,long expectedRevision){try{getStore().save(state,expectedRevision);return ok();}catch(IllegalStateException|IllegalArgumentException e){return failure(e.getMessage());}catch(Exception e){return failure("本机保存失败，请检查可用空间。更改未提交");}}
        @JavascriptInterface public String appInfo(){return "{\"version\":\"1.0.0\",\"storage\":\"AES-256-GCM / Android Keystore / SQLite\"}";}
        @JavascriptInterface public void setPrivacy(boolean enabled){runOnUiThread(()->{if(enabled)getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);});}
        @JavascriptInterface public void exportFile(String name,String mime,String encoded){
            if(encoded.length()>40*1024*1024)return;
            runOnUiThread(()->{if(fileBusy){Toast.makeText(MainActivity.this,"请先完成当前文件操作",Toast.LENGTH_SHORT).show();return;}try{pendingExport=Base64.decode(encoded,Base64.DEFAULT);fileBusy=true;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name.replaceAll("[\\\\/\\x00-\\x1f]","_"));startActivityForResult(intent,EXPORT);}catch(Exception e){pendingExport=null;fileBusy=false;Toast.makeText(MainActivity.this,"无法打开文件保存器",Toast.LENGTH_LONG).show();}});
        }
        @JavascriptInterface public void importFile(){runOnUiThread(()->{if(fileBusy)return;try{fileBusy=true;startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),IMPORT);}catch(Exception e){fileBusy=false;Toast.makeText(MainActivity.this,"无法打开文件选择器",Toast.LENGTH_LONG).show();}});}
        @JavascriptInterface public void importAttachment(){runOnUiThread(()->{if(fileBusy)return;try{fileBusy=true;startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/png","image/jpeg","application/pdf"}),ATTACHMENT);}catch(Exception e){fileBusy=false;Toast.makeText(MainActivity.this,"无法打开文件选择器",Toast.LENGTH_LONG).show();}});}
        @JavascriptInterface public String scheduleReminder(int hour,int minute){
            if(hour<8||hour>=22||minute<0||minute>59)return failure("请选择 08:00 至 21:59 的有效时间");
            reminderHour=hour;reminderMinute=minute;
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
                boolean asked=getPreferences(0).getBoolean("notificationAsked",false);
                if(asked)return failure("通知权限未开启，请在 Android 系统设置中开启；App 内仍可查看待办");
                getPreferences(0).edit().putBoolean("notificationAsked",true).apply();
                runOnUiThread(()->requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},21));return failure("请先完成系统通知授权，允许后会保存本次提醒设置");
            }
            NotificationManager nm=getSystemService(NotificationManager.class);if(!nm.areNotificationsEnabled())return failure("系统通知已关闭，请在系统设置中开启");
            ReminderReceiver.configure(MainActivity.this,hour,minute);return ok();
        }
        @JavascriptInterface public void cancelReminder(){ReminderReceiver.cancel(MainActivity.this);}
        @JavascriptInterface public void openPrint(String content){
            if(content.length()>100000)return;
            runOnUiThread(()->{WebView printView=new WebView(MainActivity.this);String escaped=content.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;");printView.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView view,String url){PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);pm.print("成长蓝图复盘",view.createPrintDocumentAdapter("成长复盘"),null);}});printView.loadDataWithBaseURL(null,"<html><head><meta charset='utf-8'><style>body{font:16px sans-serif;padding:28px;color:#172b34}pre{white-space:pre-wrap;line-height:1.9;font:inherit}</style></head><body><pre>"+escaped+"</pre></body></html>","text/html","UTF-8",null);});
        }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==21&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED){ReminderReceiver.configure(this,reminderHour,reminderMinute);Toast.makeText(this,"每日提醒已设置",Toast.LENGTH_SHORT).show();}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=EXPORT&&request!=IMPORT&&request!=ATTACHMENT)return;fileBusy=false;if(result!=RESULT_OK||data==null||data.getData()==null){pendingExport=null;return;}Uri uri=data.getData();
        if(request==EXPORT){try{if(pendingExport==null)throw new IllegalStateException();try(OutputStream stream=getContentResolver().openOutputStream(uri,"wt")){if(stream==null)throw new IllegalStateException();stream.write(pendingExport);}Toast.makeText(this,"文件已保存，请妥善保管",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"文件保存失败，请重试",Toast.LENGTH_LONG).show();}finally{pendingExport=null;}}
        else{new Thread(()->{String event=request==ATTACHMENT?"blueprint-attachment":"blueprint-import";try(InputStream stream=getContentResolver().openInputStream(uri);ByteArrayOutputStream buffer=new ByteArrayOutputStream()){if(stream==null)throw new IllegalStateException();int limit=request==ATTACHMENT?5:20;byte[] chunk=new byte[8192];int n;while((n=stream.read(chunk))!=-1){if(buffer.size()+n>limit*1024*1024)throw new IllegalArgumentException("文件超过 "+limit+"MB");buffer.write(chunk,0,n);}String name="已选择的加密备份";if(request==ATTACHMENT){name="成果附件";try(android.database.Cursor cursor=getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}}emit(event,new JSONObject().put("name",name).put("data",Base64.encodeToString(buffer.toByteArray(),Base64.NO_WRAP)));}catch(Exception e){try{emit(event,new JSONObject().put("error",e instanceof IllegalArgumentException?e.getMessage():"文件读取失败"));}catch(Exception ignored){}}},"backup-reader").start();}
    }
    @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('blueprint-back'))",null);else finish();}
    @Override protected void onDestroy(){destroyed=true;if(web!=null){web.removeJavascriptInterface("BlueprintNative");web.destroy();}if(store!=null)store.close();super.onDestroy();}
}
