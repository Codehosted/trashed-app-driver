package com.trashed.driver;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeChatMeasuredIntegrationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private void main(Runnable runnable) { instrumentation.runOnMainSync(runnable); instrumentation.waitForIdleSync(); }
    private static JSONObject box(double x, double y, double w, double h) throws Exception { return new JSONObject().put("x",x).put("y",y).put("width",w).put("height",h); }
    private static JSONObject node(String id, String type, double x, double y, double w, double h) throws Exception { return new JSONObject().put("id",id).put("type",type).put("box",box(x,y,w,h)); }
    private static JSONObject raster() throws Exception {
        Bitmap image = Bitmap.createBitmap(16,16, Bitmap.Config.ARGB_8888); image.eraseColor(0xff7033ff);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.PNG,100,bytes); image.recycle();
        return new JSONObject().put("width",16).put("height",16).put("base64",android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP));
    }
    private static JSONObject payload() throws Exception {
        JSONObject raw = NativeChatIntegrationTest.payload();
        raw.getJSONArray("actions").put(new JSONObject().put("id","edit").put("kind","component").put("label","Draft"));
        JSONObject icon = node("icon","image",8,8,16,16).put("props",new JSONObject().put("raster",raster()));
        JSONObject button = node("measured-send","button",345,12,32,32).put("actionId","send").put("accessibilityLabel","Send message").put("children",new JSONArray().put(icon));
        JSONObject field = node("measured-input","input",16,12,317,40).put("value","").put("actionId","edit").put("accessibilityLabel","Message Trisha").put("props",new JSONObject().put("inputType","textarea").put("placeholder","Ask Trisha"))
            .put("style",new JSONObject().put("fontFamily","arial").put("fontSize",14).put("lineHeight",20).put("paddingLeft",8).put("paddingTop",4).put("borderWidth",1).put("borderColor","#7033FF"));
        JSONObject composer = node("composer-root","row",0,0,393,64).put("children",new JSONArray().put(field).put(button));
        JSONObject message = node("message-root","row",0,0,393,70).put("children",new JSONArray().put(node("bubble","card",105,8,272,54).put("children",new JSONArray().put(node("body","text",12,10,245,20).put("text","Exact measured native text").put("style",new JSONObject().put("fontSize",14).put("lineHeight",20).put("fontFamily","arial"))))));
        raw.getJSONArray("messages").put(new JSONObject().put("id","message").put("role","user").put("text","MUST NOT DUPLICATE").put("presentation","measured").put("components",new JSONArray().put(message)));
        raw.put("screen",new JSONObject().put("toolbar",new JSONArray().put(node("toolbar-root","row",0,0,393,48))).put("composer",new JSONArray().put(composer)).put("accessory",new JSONArray()).put("overlay",new JSONArray()).put("footer",new JSONArray().put(node("footer-root","text",0,0,393,24).put("text","Footer"))));
        return raw;
    }
    @Test public void strictMeasuredSchemaAndRaster() throws Exception {
        JSONObject raw = payload(); new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN);
        JSONObject asset = raster(); assertTrue(NativeChatState.rasterBytes(asset).length > 33);
        asset.put("width",17); assertThrows(IllegalArgumentException.class,()->NativeChatState.rasterBytes(asset));
        asset.put("width",16).put("base64","A".repeat(196612)); assertThrows(IllegalArgumentException.class,()->NativeChatState.rasterBytes(asset));
        asset.put("base64",android.util.Base64.encodeToString(new byte[64],android.util.Base64.NO_WRAP)); assertThrows(IllegalArgumentException.class,()->NativeChatState.rasterBytes(asset));
        raw.getJSONObject("screen").getJSONArray("composer").getJSONObject(0).getJSONObject("box").put("width",16385);
        assertThrows(IllegalArgumentException.class,()->new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN));
    }
    @Test public void measuredGeometryRealControlsFooterAndFocus() throws Exception {
        NativeChatPreviewActivity activity = (NativeChatPreviewActivity)instrumentation.startActivitySync(new Intent().setClassName(instrumentation.getTargetContext().getPackageName(),NativeChatPreviewActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        JSONObject raw = payload();
        try {
            main(()->activity.chat.render(new NativeChatState(raw,NativeChatIntegrationTest.ORIGIN),false));
            main(()->{
                float density = activity.getResources().getDisplayMetrics().density;
                View bubble=activity.chat.findViewWithTag("bubble"); assertTrue(bubble instanceof FrameLayout);
                assertEquals(Math.round(105*density),bubble.getLeft()); assertEquals(Math.round(272*density),bubble.getWidth());
                assertNull(activity.chat.findViewWithTag("__native_role_message"));
                View root=activity.chat.findViewWithTag("message-root"); assertEquals(0,((View)root.getParent()).getPaddingLeft());
                View footer=activity.chat.findViewWithTag("native-chat-footer"); View composer=activity.chat.findViewWithTag("composer-root");
                assertTrue(footer.getTop()>=((View)composer.getParent()).getBottom());
                ViewGroup button=activity.chat.findViewWithTag("measured-send"); assertTrue(button.getChildAt(0) instanceof Button);
                Button control=(Button)button.getChildAt(0); assertEquals("",control.getText().toString()); assertEquals("Send message",control.getContentDescription());
                assertEquals(0,control.getMinimumHeight()); assertEquals(0,control.getPaddingLeft()); assertFalse(control.getIncludeFontPadding());
                ImageView icon=activity.chat.findViewWithTag("icon"); assertNotNull(icon.getDrawable()); assertFalse(icon.isClickable());
                EditText input=activity.chat.findViewWithTag("measured-input"); input.requestFocus(); input.setText("local pending"); input.setSelection(5);
                try { raw.put("revision",2); } catch(Exception e) { throw new AssertionError(e); }
                activity.chat.render(new NativeChatState(raw,NativeChatIntegrationTest.ORIGIN),false);
                assertSame(input,activity.chat.findViewWithTag("measured-input")); assertEquals("local pending",input.getText().toString()); assertEquals(5,input.getSelectionStart()); assertTrue(input.hasFocus());
                button.performClick(); assertEquals("send",activity.events.get(activity.events.size()-1).optString("id"));
                activity.chat.render(new NativeChatState(raw,NativeChatIntegrationTest.ORIGIN),true); assertFalse(control.isEnabled());
            });
        } finally { main(activity::finish); }
    }
    @Test public void actualMeasuredWebFixture() throws Exception { renderFixture("native-chat-measured-android.json", "measured-android"); }
    @Test public void actualMeasuredDarkWebFixture() throws Exception { renderFixture("native-chat-measured-android-dark.json", "measured-android-dark"); }
    private void renderFixture(String asset, String capture) throws Exception {
        org.junit.Assume.assumeTrue("Web owner has not published measured fixture yet",Arrays.asList(instrumentation.getContext().getAssets().list("")).contains(asset));
        JSONObject raw; try(InputStream in=instrumentation.getContext().getAssets().open(asset)) { raw=new JSONObject(new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)); }
        NativeChatPreviewActivity activity = (NativeChatPreviewActivity)instrumentation.startActivitySync(new Intent().setClassName(instrumentation.getTargetContext().getPackageName(),NativeChatPreviewActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            main(()->{ activity.fixture = raw; try { activity.render(false); } catch(Exception error) { throw new AssertionError(error); } });
            main(()->{ assertEquals("Real emulator CSS viewport width", 411.42857, activity.chat.getWidth()/activity.getResources().getDisplayMetrics().density, .02); });
            main(()->{ for(String slot:Arrays.asList("toolbar","composer","footer")) { JSONArray nodes=raw.optJSONObject("screen").optJSONArray(slot); if(nodes!=null) for(int i=0;i<nodes.length();i++) verifyTree(activity.chat,nodes.optJSONObject(i)); } JSONArray messages=raw.optJSONArray("messages"); for(int i=0;i<messages.length();i++){ JSONArray nodes=messages.optJSONObject(i).optJSONArray("components"); if(nodes!=null)for(int j=0;j<nodes.length();j++)verifyTree(activity.chat,nodes.optJSONObject(j)); }});
            Bitmap screenshot=instrumentation.getUiAutomation().takeScreenshot(); assertNotNull(screenshot);
            File directory=new File(instrumentation.getTargetContext().getFilesDir(),"native-chat-fixture"); directory.mkdirs();
            try(FileOutputStream out=new FileOutputStream(new File(directory,capture+".png"))) { assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG,100,out)); } screenshot.recycle();
        } finally { main(activity::finish); }
    }
    private void verifyTree(NativeChatView chat,JSONObject node) {
        View view=chat.findViewWithTag(node.optString("id")); assertNotNull(node.optString("id"),view);
        JSONObject box=node.optJSONObject("box"); float density=chat.getResources().getDisplayMetrics().density;
        if(box!=null) { assertEquals(node.optString("id")+" width",Math.round(box.optDouble("width")*density),view.getWidth(),1); assertEquals(node.optString("id")+" height",Math.round(box.optDouble("height")*density),view.getHeight(),1); if(view.getParent() instanceof FrameLayout){ assertEquals(Math.round(box.optDouble("x")*density),view.getLeft(),1); assertEquals(Math.round(box.optDouble("y")*density),view.getTop(),1); } }
        JSONObject style=node.optJSONObject("style");
        if(style!=null) {
            assertEquals((float)style.optDouble("opacity",1), view.getAlpha(), .001f);
            if(view instanceof ImageView && style.optDouble("radius",0)>0) assertTrue("Rounded image must clip pixels",view.getClipToOutline());
            TextView text=view instanceof TextView?(TextView)view:view instanceof FrameLayout && ((FrameLayout)view).getChildCount()>0 && ((FrameLayout)view).getChildAt(0) instanceof Button?(TextView)((FrameLayout)view).getChildAt(0):null;
            if(text!=null && "jakarta".equals(style.optString("fontFamily"))) {
                String weight=style.optString("fontWeight","regular");
                String face=weight.equals("bold")?"Bold":weight.equals("semibold")?"SemiBold":weight.equals("medium")?"Medium":"Regular";
                assertEquals(android.graphics.Typeface.createFromAsset(chat.getContext().getAssets(),"native-chat-fonts/TrashedJakarta-"+face+".ttf"),text.getTypeface());
                assertFalse(text.getPaint().isFakeBoldText());
            }
        }
        JSONArray children=node.optJSONArray("children"); if(children!=null)for(int i=0;i<children.length();i++)verifyTree(chat,children.optJSONObject(i));
    }
}
