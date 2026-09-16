package com.trashed.driver;

import android.app.Instrumentation;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SecureChatBridgeTest {
    final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    SecureChatBridgeActivity activity;
    void main(Runnable task) { ins.runOnMainSync(task); }
    String js(String source) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        main(()->activity.getBridge().getWebView().evaluateJavascript(source,result->{value.set(result);done.countDown();}));
        assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();
    }
    void await(String expression,String expected) throws Exception {
        String actual="";for(int i=0;i<100;i++){actual=js(expression);if(expected.equals(actual))return;Thread.sleep(50);}
        assertEquals(expression,expected,actual);
    }
    @Before public void launch() throws Exception {
        activity=(SecureChatBridgeActivity)ins.startActivitySync(new Intent().setClassName(ins.getTargetContext().getPackageName(),SecureChatBridgeActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        await("typeof Capacitor !== 'undefined' && typeof Capacitor.nativePromise === 'function'","true");
        main(()->{MainActivity.OnboardingWebView v=(MainActivity.OnboardingWebView)activity.getBridge().getWebView();assertTrue(v.legacyBridgeInstalled);assertTrue(v.chatChannelSecured);assertTrue(activity.getBridge().getConfig().isUsingLegacyBridge());});
    }
    @After public void close() { if(activity!=null)main(()->{if(SecureChatBridgeActivity.saved!=null)SecureChatBridgeActivity.saved.release(activity.getBridge());activity.finish();}); }
    static String message(String plugin,String callback,String method) {
        return "{pluginId:'"+plugin+"',callbackId:'"+callback+"',methodName:'"+method+"',options:{}}";
    }
    @Test public void realCapacitorRoutingRejectsFramesAndWrongOrigin() throws Exception {
        js("window.reply=null;Capacitor.nativePromise('TrashedChat','probe',{}).then(v=>window.reply=v.route)");
        await("window.reply","\"secure\"");assertEquals(1,SecureChatBridgeActivity.chats.get());
        // A same-origin child has both bridges. Its raw legacy call and dedicated
        // call must BOTH be denied; ordinary legacy plugins must still execute.
        String child="androidBridge.postMessage(JSON.stringify("+message("TrashedChat","child-legacy","probe")+"));"
            +"if(typeof trashedChatBridge!=='undefined')trashedChatBridge.postMessage(JSON.stringify("+message("TrashedChat","child-secure","probe")+"));"
            +"androidBridge.postMessage(JSON.stringify("+message("BackgroundCallbackProbe","child-ping","ping")+"));"
            +"parent.postMessage({kind:'frame-proof',secure:typeof trashedChatBridge},'*');";
        js("window.frameProof=[];addEventListener('message',e=>{if(e.data.kind==='frame-proof')frameProof.push(e.data.secure)});"
            +"var frame=document.createElement('iframe');frame.srcdoc="+org.json.JSONObject.quote("<script>"+child+"</script>")+";document.body.append(frame)");
        await("frameProof.length","1");assertEquals(1,SecureChatBridgeActivity.pings.get());assertEquals(1,SecureChatBridgeActivity.chats.get());
        // Sandboxed srcdoc has an opaque cross-origin principal, but the legacy
        // Java interface remains exposed. Attempt both routes from that frame.
        js("var evil=document.createElement('iframe');evil.sandbox='allow-scripts';evil.srcdoc="+org.json.JSONObject.quote("<script>"+child+"</script>")+";document.body.append(evil)");
        await("frameProof.length","2");await("frameProof[1]","\"undefined\"");assertEquals(2,SecureChatBridgeActivity.pings.get());assertEquals(1,SecureChatBridgeActivity.chats.get());
        js("trashedChatBridge.postMessage(JSON.stringify("+message("BackgroundCallbackProbe","wrong-plugin","ping")+"))");Thread.sleep(150);assertEquals(2,SecureChatBridgeActivity.pings.get());
        // Wrong-origin top-level page receives no secure channel or router.
        main(()->activity.getBridge().getWebView().loadDataWithBaseURL("https://wrong-origin.invalid/", "<p>Offline wrong origin</p>","text/html","UTF-8",null));
        await("location.origin","\"https://wrong-origin.invalid\"");await("typeof trashedChatBridge","\"undefined\"");
        js("androidBridge.postMessage(JSON.stringify("+message("TrashedChat","wrong-origin","probe")+"))");Thread.sleep(150);assertEquals(1,SecureChatBridgeActivity.chats.get());
        android.util.Log.i("SecureBridgeEvidence","Actual Capacitor Promise roundtrip; same-origin/opaque child and wrong-origin top-level denied; nonchat legacy pass-through verified");
    }
    @Test public void savedCallbacksContinueBeyondFiveMinutesInBackground() throws Exception {
        js("window.sequences=[];Capacitor.nativeCallback('BackgroundCallbackProbe','watch',{},r=>sequences.push(r.sequence));");
        await("JSON.stringify(sequences)","\"[1]\"");
        assertTrue(ins.getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME));
        long started=android.os.SystemClock.elapsedRealtime();
        Thread.sleep(310000);
        SecureChatBridgeActivity.saved.resolve(new JSObject().put("sequence",2));
        await("JSON.stringify(sequences)","\"[1,2]\"");
        assertTrue(android.os.SystemClock.elapsedRealtime()-started>=310000);
        assertTrue(activity.getBridge().getConfig().isUsingLegacyBridge());
        android.util.Log.i("SecureBridgeEvidence","Retained SDK callback delivered after >5min background; transport proof, not physical GPS/HTTP beacon proof");
    }
    @Test public void savedPluginCallbacksUseLegacyFromNative() throws Exception {
        js("window.sequences=[];window.legacyReplies=0;const original=Capacitor.fromNative;Capacitor.fromNative=(r)=>{legacyReplies++;return original(r)};Capacitor.nativeCallback('BackgroundCallbackProbe','watch',{},r=>sequences.push(r.sequence));");
        await("JSON.stringify(sequences)","\"[1]\"");assertNotNull(SecureChatBridgeActivity.saved);
        assertSame(SecureChatBridgeActivity.saved,activity.getBridge().getSavedCall(SecureChatBridgeActivity.saved.getCallbackId()));
        // Saved calls use the actual SDK legacy response branch, not replyProxy.
        SecureChatBridgeActivity.saved.resolve(new JSObject().put("sequence",2));
        await("JSON.stringify(sequences)","\"[1,2]\"");await("legacyReplies","2");
        assertTrue(SecureChatBridgeActivity.saved.isKeptAlive());
        android.util.Log.i("SecureBridgeEvidence","Saved keepAlive callback resolves twice via Capacitor.fromNative with useLegacyBridge=true (not GPS or a five-minute timing test)");
    }
}
