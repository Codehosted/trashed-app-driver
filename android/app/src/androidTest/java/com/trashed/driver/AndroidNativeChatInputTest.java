package com.trashed.driver;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.speech.RecognizerIntent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AndroidNativeChatInputTest {
    final Instrumentation ins = InstrumentationRegistry.getInstrumentation();
    NativeChatInputActivity activity;
    TrashedChatPlugin plugin;
    static void field(Object object, Class<?> owner, String name, Object value) {
        try { java.lang.reflect.Field f=owner.getDeclaredField(name);f.setAccessible(true);f.set(object,value); }
        catch(Exception error) {throw new AssertionError(error);}
    }
    static Object field(Object object, Class<?> owner, String name) {
        try { java.lang.reflect.Field f=owner.getDeclaredField(name);f.setAccessible(true);return f.get(object); }
        catch(Exception error) {throw new AssertionError(error);}
    }
    void main(Runnable r) { ins.runOnMainSync(r); ins.waitForIdleSync(); }
    @Before public void launch() throws Exception {
        assertEquals("ranchu", android.os.Build.HARDWARE);
        activity=(NativeChatInputActivity)ins.startActivitySync(new Intent().setClassName(ins.getTargetContext().getPackageName(),NativeChatInputActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        for(int i=0;i<100;i++) { AtomicBoolean ready=new AtomicBoolean();main(()->ready.set(activity.canPresentChat()));if(ready.get())break;Thread.sleep(100); }
        main(()->{assertTrue("Actual guard: mainFrame="+activity.chatBridgeMainFrameOnly()+", legacy="+activity.getBridge().getConfig().isUsingLegacyBridge()+", navigation="+activity.canPresentNavigation()+", resumed="+field(activity,MainActivity.class,"chatResumed")+", loading="+activity.navigationLoading()+", cookiePresent="+!activity.chatSession().isEmpty()+", url="+activity.getBridge().getWebView().getUrl(),activity.canPresentChat()); plugin=(TrashedChatPlugin)activity.getBridge().getPlugin("TrashedChat").getInstance(); state();});
    }
    void state() {
        try { field(plugin,TrashedChatPlugin.class,"state",new NativeChatState(NativeChatIntegrationTest.payload(),activity.chatOrigin()));
            field(plugin,TrashedChatPlugin.class,"session",activity.chatSession());
        }catch(Exception error){throw new AssertionError(error);}
    }
    @After public void close() {
        if(activity!=null)main(()->{ android.webkit.CookieManager.getInstance().setCookie("https://input-fixture.invalid","next-auth.session-token=; Max-Age=0; Secure; Path=/"); activity.finish(); });
    }
    Call begin(String method) {
        Call call=new Call(method);main(()->{plugin.event("action","testcontext",1,"send",null);if(method.equals("pickFiles"))plugin.pickFiles(call);else plugin.dictate(call);});return call;
    }
    void settled(Call call) throws Exception {assertTrue("Input callback did not settle",call.done.await(30,TimeUnit.SECONDS));assertEquals(1,call.count.get());}
    void cancelled(Call call) throws Exception {settled(call);assertNull(call.message,call.error);assertTrue(call.result.optBoolean("cancelled"));}
    void unlocked() {main(()->assertNull(field(plugin,TrashedChatPlugin.class,"inputCall")));}
    AccessibilityNodeInfo find(AccessibilityNodeInfo node,String label) {
        if(node==null)return null;
        if(label.contentEquals(node.getText()==null?"":node.getText()) || label.contentEquals(node.getContentDescription()==null?"":node.getContentDescription()))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo found=find(node.getChild(i),label);if(found!=null)return found;}return null;
    }
    void click(String label) throws Exception {
        for(int i=0;i<70;i++){ AccessibilityNodeInfo node=find(ins.getUiAutomation().getRootInActiveWindow(),label);if(node!=null){while(node!=null&&!node.isClickable())node=node.getParent();assertNotNull(label,node);assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_CLICK));return;}Thread.sleep(100); }
        throw new AssertionError("System UI missing: "+label+" root="+ins.getUiAutomation().getRootInActiveWindow());
    }
    void foreground(String name) throws Exception {
        for(int i=0;i<70;i++){AccessibilityNodeInfo node=ins.getUiAutomation().getRootInActiveWindow();if(node!=null&&node.getPackageName()!=null&&node.getPackageName().toString().contains(name))return;Thread.sleep(100);}throw new AssertionError("No foreground "+name);
    }
    void back(){assertTrue(ins.getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK));}
    @Test public void realSystemPickerCancelAndSelectAfterTicketExpires() throws Exception {
        Call cancel=begin("pickFiles");foreground("documentsui");back();cancelled(cancel);unlocked();
        Call selected=begin("pickFiles");foreground("documentsui");
        click("Show roots");click("Trashed Synthetic Input");
        // Ticket gates the launch only, not the user's time choosing a document.
        Thread.sleep(3200);click("small0.txt");settled(selected);assertNull(selected.message,selected.error);
        assertEquals(1,selected.result.optJSONArray("files").length());
        assertEquals("small0.txt",selected.result.optJSONArray("files").getJSONObject(0).getString("name"));
        assertEquals(23,android.util.Base64.decode(selected.result.optJSONArray("files").getJSONObject(0).getString("base64"),0).length);unlocked();
        android.util.Log.i("NativeInputEvidence","REAL_DOCUMENTS_UI cancel + synthetic selection after >3s passed");
    }
    Intent selection(String... ids) {
        Intent result=new Intent();android.content.ClipData clip=null;
        for(String id:ids){Uri uri=Uri.parse("content://"+NativeChatInputBytes.AUTHORITY+"/"+id);if(clip==null)clip=android.content.ClipData.newRawUri("synthetic-only",uri);else clip.addItem(new android.content.ClipData.Item(uri));}
        result.setClipData(clip); return result;
    }
    Call intercepted(Intent result,Runnable before) throws Exception {
        Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(){@Override public Instrumentation.ActivityResult onStartActivity(Intent intent){assertEquals(Intent.ACTION_OPEN_DOCUMENT,intent.getAction());assertNull(intent.getData());assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false));if(before!=null)before.run();return new Instrumentation.ActivityResult(Activity.RESULT_OK,result);}};
        ins.addMonitor(monitor);try {Call call=begin("pickFiles");settled(call);return call;}finally{ins.removeMonitor(monitor);}
    }
    @Test public void boundedSyntheticResultsAndStaleGeneration() throws Exception {
        // Grants are restricted to our generated provider; no user URI is read.
        ins.getUiAutomation().adoptShellPermissionIdentity("android.permission.MANAGE_DOCUMENTS");
        try {
            Call eight=intercepted(selection("small0","small1","small2","small3","small4","small5","small6","small7"),null);assertNull(eight.message,eight.error);assertEquals(8,eight.result.optJSONArray("files").length());
            Call nine=intercepted(selection("small0","small1","small2","small3","small4","small5","small6","small7","small8"),null);assertEquals("INPUT_FAILED",nine.error);
            Call limit=intercepted(selection("limit"),null);assertNull(limit.message,limit.error);assertEquals(12*1024*1024,android.util.Base64.decode(limit.result.optJSONArray("files").getJSONObject(0).getString("base64"),0).length);limit.result=null;
            Call over=intercepted(selection("oversize"),null);assertEquals("INPUT_FAILED",over.error);
            Call stale=intercepted(selection("small0"),()->field(activity,MainActivity.class,"navigationDocument",activity.navigationDocument()+1));cancelled(stale);unlocked();
            android.util.Log.i("NativeInputEvidence","SYNTHETIC_CALLBACK 8 accepted,9 rejected,12MiB accepted,+1 rejected,stale generation cancelled");
        }finally{ins.getUiAutomation().dropShellPermissionIdentity();}
    }
    @Test public void resetRetainsOutstandingPickerLockUntilActualCallback() throws Exception {
        Call first=begin("pickFiles");foreground("documentsui");
        main(()->{plugin.reset(false,false);assertNotNull(field(plugin,TrashedChatPlugin.class,"inputCall"));state();
            // Launch admission is still blocked even with a fresh ticket and resumed flag.
            field(activity,MainActivity.class,"chatResumed",true);
        });cancelled(first);
        Call overlap=begin("dictate");settled(overlap);assertEquals("STALE_ACTION",overlap.error);
        back();foreground("com.trashed.driver");unlocked();assertEquals(1,first.count.get());
        Call retry=begin("pickFiles");foreground("documentsui");back();cancelled(retry);unlocked();
        android.util.Log.i("NativeInputEvidence","REAL_PICKER reset settles once,overlap blocked,old callback releases lock,retry succeeds");
    }
    @Test public void realSpeechCancelAndInjectedUnavailable() throws Exception {
        Call speech=begin("dictate");
        // The approved image has Google TTS's recognition Activity; never speak or send.
        foreground("google.android.tts");back();cancelled(speech);unlocked();
        java.util.Map<String,androidx.activity.result.ActivityResultLauncher<Intent>> launchers=(java.util.Map<String,androidx.activity.result.ActivityResultLauncher<Intent>>)field(plugin,Plugin.class,"activityLaunchers");
        androidx.activity.result.ActivityResultLauncher<Intent> original=launchers.get("speechRecognized");
        main(()->launchers.put("speechRecognized",new androidx.activity.result.ActivityResultLauncher<Intent>() {
            public void launch(Intent intent,androidx.core.app.ActivityOptionsCompat options){assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH,intent.getAction());throw new ActivityNotFoundException("Synthetic unavailable provider");}
            public void unregister(){} public androidx.activity.result.contract.ActivityResultContract<Intent,?> getContract(){return original.getContract();}
        }));
        try {Call unavailable=begin("dictate");settled(unavailable);assertEquals("INPUT_FAILED",unavailable.error);assertTrue(unavailable.message.contains("unavailable"));unlocked();}
        finally{main(()->launchers.put("speechRecognized",original));}
        android.util.Log.i("NativeInputEvidence","REAL_SPEECH_ACTIVITY cancellation; INJECTED ActivityNotFound unavailable settles/releases");
    }
    @Test public void expiredTicketAndAuthGuardsStillReject() throws Exception {
        Call expired=new Call("pickFiles");main(()->{plugin.event("action","testcontext",1,"send",null);field(plugin,TrashedChatPlugin.class,"ticketExpires",SystemClock.elapsedRealtime()-1);plugin.pickFiles(expired);});settled(expired);assertEquals("STALE_ACTION",expired.error);
        main(()->field(plugin,TrashedChatPlugin.class,"session","wrong-session"));Call auth=begin("pickFiles");settled(auth);assertEquals("STALE_ACTION",auth.error);unlocked();
    }
    static final class Call extends PluginCall {
        final CountDownLatch done=new CountDownLatch(1);final AtomicInteger count=new AtomicInteger();volatile JSObject result;volatile String error,message;
        Call(String method){super(null,"TrashedChat",UUID.randomUUID().toString(),method,new JSObject().put("context","testcontext").put("revision",1).put("id","send"));}
        @Override public void resolve(JSObject value){result=value;count.incrementAndGet();done.countDown();}
        @Override public void reject(String message,String code){this.message=message;error=code;count.incrementAndGet();done.countDown();}
    }
}
