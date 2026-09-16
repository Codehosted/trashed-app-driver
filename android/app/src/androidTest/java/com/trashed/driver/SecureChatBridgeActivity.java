package com.trashed.driver;

import android.os.Bundle;
import android.webkit.*;
import android.view.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/** Synthetic transport-only harness: no login, GPS, network, or provider sends. */
public class SecureChatBridgeActivity extends BridgeActivity {
    static final String ORIGIN = "https://secure-bridge-fixture.invalid";
    static final AtomicInteger chats = new AtomicInteger(), pings = new AtomicInteger();
    static volatile PluginCall saved;
    @CapacitorPlugin(name="TrashedChat") public static class ChatProbe extends Plugin {
        @PluginMethod public void probe(PluginCall call) { chats.incrementAndGet(); call.resolve(new JSObject().put("route", "secure")); }
    }
    @CapacitorPlugin(name="BackgroundCallbackProbe") public static class BackgroundProbe extends Plugin {
        @PluginMethod public void ping(PluginCall call) { pings.incrementAndGet(); call.resolve(); }
        @PluginMethod(returnType=PluginMethod.RETURN_CALLBACK) public void watch(PluginCall call) {
            call.setKeepAlive(true); getBridge().saveCall(call); saved=call;
            call.resolve(new JSObject().put("sequence", 1));
        }
    }
    @Override protected void load() {
        WebView original=findViewById(com.getcapacitor.android.R.id.webview);
        ViewGroup parent=(ViewGroup)original.getParent(); int index=parent.indexOfChild(original);
        MainActivity.OnboardingWebView view=new MainActivity.OnboardingWebView(this);
        view.chatServerOrigin=ORIGIN; view.setId(original.getId());
        ViewGroup.LayoutParams params=original.getLayoutParams();parent.removeView(original);parent.addView(view,index,params);original.destroy();super.load();
    }
    @Override protected void onCreate(Bundle state) {
        if (!"ranchu".equals(android.os.Build.HARDWARE)) throw new SecurityException("Emulator only");
        chats.set(0);pings.set(0);saved=null;
        config=new CapConfig.Builder(this).setServerUrl(ORIGIN).setStartPath("/app").setUseLegacyBridge(true).setLoggingEnabled(false).create();
        registerPlugin(ChatProbe.class);registerPlugin(BackgroundProbe.class);super.onCreate(state);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream("<html><body>Offline bridge fixture</body></html>".getBytes(StandardCharsets.UTF_8)));
            }
        });
        ((MainActivity.OnboardingWebView)getBridge().getWebView()).appNavigationEnabled=true;
        getBridge().getWebView().loadUrl(ORIGIN+"/app");
    }
}
