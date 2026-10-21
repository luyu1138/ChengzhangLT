package cn.chengzhang.blueprint;

import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.RenderProcessGoneDetail;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Verifies the installed WebView engine independently from the application's JavaScript. */
@RunWith(AndroidJUnit4.class)
public class WebViewStartupTest {
    private void probe(boolean secureAsset) throws Exception {
        CountDownLatch complete=new CountDownLatch(1);
        AtomicReference<String> result=new AtomicReference<>();
        AtomicReference<WebView> reference=new AtomicReference<>();
        new android.os.Handler(android.os.Looper.getMainLooper()).post(()->{
            WebView view=new WebView(InstrumentationRegistry.getInstrumentation().getTargetContext());reference.set(view);view.getSettings().setJavaScriptEnabled(true);
            String html="<html><head><title>engine-ready</title></head><body>Engine probe<script>document.title='engine-ready';</script></body></html>";
            view.setWebViewClient(new WebViewClient(){
                @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));}
                @Override public void onPageFinished(WebView v,String url){v.evaluateJavascript(secureAsset?"typeof crypto.randomUUID()":"document.title",value->{result.set(value);complete.countDown();});}
                @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){result.set("renderer-crashed");reference.set(null);v.destroy();complete.countDown();return true;}
            });
            if(secureAsset)view.loadUrl("https://appassets.androidplatform.net/probe.html");else view.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);
        });
        try{assertTrue("WebView startup timed out",complete.await(120,TimeUnit.SECONDS));assertEquals(secureAsset?"\"string\"":"\"engine-ready\"",result.get());}
        finally{new android.os.Handler(android.os.Looper.getMainLooper()).post(()->{if(reference.get()!=null)reference.get().destroy();});}
    }
    @Test public void rendersLocalHtmlWithJavaScript() throws Exception {probe(false);}
    @Test public void loadsInterceptedHttpsAssetAndSecureRandom() throws Exception {probe(true);}
}
