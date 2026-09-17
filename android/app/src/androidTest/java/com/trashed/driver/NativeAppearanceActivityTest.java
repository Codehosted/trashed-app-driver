package com.trashed.driver;

import static org.junit.Assert.*;
import static com.trashed.driver.NativeWorkspaceShellTest.*;
import static com.trashed.driver.NativeWorkspaceRegressionTest.text;
import android.content.*;
import android.webkit.*;
import android.widget.*;
import android.view.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeWebViewClient;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.Test;

/** Real OS uiMode delivery to the production Activity, with authenticated loopback HTTP only. */
public class NativeAppearanceActivityTest {
 static final String DASHBOARD="{\"version\":1,\"generatedAt\":\"2026-09-16T12:00:00.000Z\",\"scope\":{\"userId\":1,\"vendorId\":2},\"businessName\":\"SYNTHETIC QA Dumpster Co\",\"currency\":\"USD\",\"revenue\":{\"today\":150,\"thisWeek\":550,\"thisMonth\":1800,\"thisQuarter\":4100,\"thisYear\":14650,\"monthlyGrowthPercent\":50},\"monthlyRevenue\":[{\"month\":\"Oct\",\"revenue\":0},{\"month\":\"Nov\",\"revenue\":0},{\"month\":\"Dec\",\"revenue\":0},{\"month\":\"Jan\",\"revenue\":0},{\"month\":\"Feb\",\"revenue\":0},{\"month\":\"Mar\",\"revenue\":0},{\"month\":\"Apr\",\"revenue\":0},{\"month\":\"May\",\"revenue\":0},{\"month\":\"Jun\",\"revenue\":0},{\"month\":\"Jul\",\"revenue\":0},{\"month\":\"Aug\",\"revenue\":1200},{\"month\":\"Sep\",\"revenue\":1800}],\"rentals\":{\"total\":18,\"active\":6,\"pending\":2,\"completed\":10},\"inventory\":{\"total\":12,\"available\":5,\"rented\":6,\"maintenance\":1},\"customers\":{\"total\":9},\"inventoryByType\":[{\"name\":\"roll_off\",\"count\":8},{\"name\":\"storage_pod\",\"count\":4}]}";
 static String shell(String command)throws Exception{
  try(android.os.ParcelFileDescriptor p=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(p)){return new String(in.readAllBytes(),StandardCharsets.UTF_8).trim();}
 }
 static void mode(ActivityScenario<MainActivity> scenario,MainActivity original,boolean dark)throws Exception{
  shell("cmd uimode night "+(dark?"yes":"no"));
  await(scenario,"OS uiMode "+dark,a->NativeSystemAppearance.dark(a)==dark);
  InstrumentationRegistry.getInstrumentation().waitForIdleSync();
  scenario.onActivity(a->{assertSame("Configuration must not recreate Activity",original,a);assertEquals(dark?0xff131315:0xfffafafb,NativeSystemAppearance.background(a.findViewById(android.R.id.content)));});
 }
 static void themedScreenshot(ActivityScenario<MainActivity> scenario,boolean dark,String file)throws Exception{
  int expected=dark?0xff131315:0xfffafafb;
  long deadline=android.os.SystemClock.uptimeMillis()+8000;
  while(android.os.SystemClock.uptimeMillis()<deadline){
   InstrumentationRegistry.getInstrumentation().waitForIdleSync();
   android.graphics.Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
   boolean painted=bitmap!=null && bitmap.getPixel(10,bitmap.getHeight()/2)==expected;
   int statusPixels=0;
   if(painted)for(int y=15;y<bitmap.getHeight()/20;y++)for(int x=20;x<bitmap.getWidth()-20;x++){
    int color=bitmap.getPixel(x,y);int brightness=(android.graphics.Color.red(color)+android.graphics.Color.green(color)+android.graphics.Color.blue(color))/3;
    if(dark?brightness>200:brightness<150)statusPixels++;
   }
   if(painted && statusPixels>30){
    File dir=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null),"native-workspace-qa");dir.mkdirs();
    try(OutputStream out=new FileOutputStream(new File(dir,file))){assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out));}
    bitmap.recycle();return;
   }
   if(bitmap!=null)bitmap.recycle();
   Thread.sleep(80);
  }
  scenario.onActivity(a->android.util.Log.e("ThemePixelQA","barFlags="+a.getWindow().getDecorView().getSystemUiVisibility()+" controller="+androidx.core.view.WindowCompat.getInsetsController(a.getWindow(),a.getWindow().getDecorView()).isAppearanceLightStatusBars()));
  android.graphics.Bitmap last=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  int pixel=last.getPixel(10,last.getHeight()/2);last.recycle();
  NativeWorkspaceRegressionTest.screenshot("theme-paint-failure.png");
  fail("OS theme was not painted: "+dark+" actual="+Integer.toHexString(pixel)+" expected="+Integer.toHexString(expected));
 }
 @Test public void systemTransitionKeepsDashboardEditorTranscriptAndPlayingAudio()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  SharedPreferences prefs=context.getSharedPreferences(MainActivity.ONBOARDING_PREFERENCES,Context.MODE_PRIVATE);
  boolean had=prefs.contains(MainActivity.ONBOARDING_VERSION_KEY);int old=prefs.getInt(MainActivity.ONBOARDING_VERSION_KEY,0);
  String originalMode=shell("cmd uimode night").replace("Night mode: ","").trim();
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setAcceptCookie(true));
  Set<String> production=cookies("https://trashed.app");
  try(NativeWorkspaceRegressionTest.Fixture server=new NativeWorkspaceRegressionTest.Fixture()){
   Set<String> prior=cookies(server.origin());
   assertTrue("Never overwrite an existing cookie",prior.stream().noneMatch(v->v.startsWith("next-auth.session-token=")));
   prefs.edit().putInt(MainActivity.ONBOARDING_VERSION_KEY,0).commit();
   try{
    shell("cmd uimode night no");
    try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
     AtomicReference<MainActivity> activity=new AtomicReference<>();AtomicReference<WebView> web=new AtomicReference<>();AtomicInteger blocked=new AtomicInteger();
     scenario.onActivity(a->{
      activity.set(a);web.set(a.getBridge().getWebView());assertNotNull(field(a,"onboardingOverlay"));
      try{Class<?> type=Class.forName("com.trashed.driver.MainActivity$AuthConfig");java.lang.reflect.Constructor<?> c=type.getDeclaredConstructor(String.class,String.class,String.class,String.class,String.class);c.setAccessible(true);Object config=c.newInstance(server.origin(),server.origin()+"/vendor",server.origin()+"/api/auth/mobile/login",server.origin()+"/api/auth/mobile/google/config",server.origin()+"/api/auth/mobile/google");java.lang.reflect.Field f=MainActivity.class.getDeclaredField("authConfig");f.setAccessible(true);f.set(a,config);}catch(Exception e){throw new AssertionError(e);}
      BridgeWebViewClient actual=a.getBridge().getWebViewClient();a.getBridge().setWebViewClient(new BridgeWebViewClient(a.getBridge()){
       @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){boolean local=NativeWorkspaceHistory.isSameOriginURL(r.getUrl().toString(),server.origin());if(!local)blocked.incrementAndGet();return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream((local?"<!doctype html><input id='draft' value='retained'>":"Blocked").getBytes(StandardCharsets.UTF_8)));}
       @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap b){actual.onPageStarted(v,u,b);}
       @Override public void onPageFinished(WebView v,String u){actual.onPageFinished(v,u);}
       @Override public void doUpdateVisitedHistory(WebView v,String u,boolean r){actual.doUpdateVisitedHistory(v,u,r);}
      });
     });
     cookie(server.origin(),"next-auth.session-token=local-fixture; Path=/; HttpOnly; SameSite=Lax");
     scenario.onActivity(a->a.getWindow().getDecorView().findViewWithTag("native-onboarding-back").performClick());
     await(scenario,"local session",a->!a.navigationLoading() && (server.origin()+"/vendor").equals(web.get().getUrl()));
     js(scenario,"history.pushState({},'', '/vendor/dashboard');true");
     await(scenario,"dashboard snapshot",a->workspace(a)!=null && field(workspace(a),"dashboardView")!=null);
     AtomicReference<NativeWorkspaceView> screen=new AtomicReference<>();AtomicReference<NativeDashboard> snapshot=new AtomicReference<>();int[] scrollY={0};
     scenario.onActivity(a->{screen.set(workspace(a));NativeDashboardView d=(NativeDashboardView)field(screen.get(),"dashboardView");snapshot.set(d.snapshot);NativeDashboardScreenTest.find(d,"Year").performClick();ScrollView s=(ScrollView)((View)field(screen.get(),"body")).getParent();s.scrollTo(0,70);scrollY[0]=s.getScrollY();});
     themedScreenshot(scenario,false,"dashboard-activity-light.png");
     int dashboardReads=server.dashboardReads.get();
     for(boolean dark:new boolean[]{true,false}){mode(scenario,activity.get(),dark);scenario.onActivity(a->{assertSame(screen.get(),workspace(a));NativeDashboardView d=(NativeDashboardView)field(screen.get(),"dashboardView");assertSame(snapshot.get(),d.snapshot);assertTrue(d.year);assertEquals(scrollY[0],((View)((View)field(screen.get(),"body")).getParent()).getScrollY());});scenario.onActivity(a->((android.widget.ScrollView)((View)field(workspace(a),"body")).getParent()).scrollTo(0,0));themedScreenshot(scenario,dark,"dashboard-activity-"+(dark?"dark":"light")+".png");scenario.onActivity(a->((android.widget.ScrollView)((View)field(workspace(a),"body")).getParent()).scrollTo(0,scrollY[0]));}
     assertEquals(dashboardReads,server.dashboardReads.get());
     js(scenario,"history.pushState({},'', '/vendor/profile');true");
     await(scenario,"profile",a->workspace(a)!=null && text(workspace(a),"Fixture User")!=null);
     AtomicReference<EditText> name=new AtomicReference<>();AtomicReference<androidx.appcompat.app.AlertDialog> editor=new AtomicReference<>(),confirm=new AtomicReference<>();
     scenario.onActivity(a->{screen.set(workspace(a));text(screen.get(),"Edit profile").performClick();editor.set((androidx.appcompat.app.AlertDialog)field(screen.get(),"editor"));name.set((EditText)field(screen.get(),"nameInput"));name.get().setText("Unsaved OS transition");name.get().setSelection(4);});
     InstrumentationRegistry.getInstrumentation().waitForIdleSync();
     scenario.onActivity(a->{editor.get().getButton(-2).performClick();Set<?> dialogs=(Set<?>)field(screen.get(),"transientDialogs");assertEquals(1,dialogs.size());confirm.set((androidx.appcompat.app.AlertDialog)dialogs.iterator().next());});
     int profileReads=server.profileReads.get();
     for(boolean dark:new boolean[]{true,false}){mode(scenario,activity.get(),dark);scenario.onActivity(a->{assertSame(screen.get(),workspace(a));assertSame(editor.get(),field(screen.get(),"editor"));assertTrue(confirm.get().isShowing());assertEquals("Unsaved OS transition",name.get().getText().toString());assertEquals(4,name.get().getSelectionStart());assertEquals(dark?0xfff6f6f8:0xff1c1c20,name.get().getCurrentTextColor());});}
     assertEquals(profileReads,server.profileReads.get());assertEquals(0,server.patches.get());
     scenario.onActivity(a->{confirm.get().getButton(-2).performClick();editor.get().dismiss();});
     js(scenario,"history.pushState({},'', '/calls/history');true");
     await(scenario,"calls",a->workspace(a)!=null && text(workspace(a),"View call")!=null);
     scenario.onActivity(a->text(workspace(a),"View call").performClick());await(scenario,"call detail",a->text(workspace(a),"Play recording")!=null);
     scenario.onActivity(a->text(workspace(a),"Play recording").performClick());await(scenario,"playing",a->workspace(a).audio.playing());
     AtomicReference<Object> transcript=new AtomicReference<>(),player=new AtomicReference<>();int[] position={0};
     scenario.onActivity(a->{screen.set(workspace(a));text(screen.get(),"Open conversation").performClick();transcript.set(field(screen.get(),"transcriptScreen"));player.set(field(screen.get().audio,"player"));position[0]=screen.get().audio.position();});
     int callReads=server.callReads.get(),audioReads=server.audioReads.get(),allProfiles=server.profileReads.get();
     for(boolean dark:new boolean[]{true,false}){mode(scenario,activity.get(),dark);scenario.onActivity(a->{assertSame(screen.get(),workspace(a));assertSame(transcript.get(),field(workspace(a),"transcriptScreen"));assertSame(player.get(),field(workspace(a).audio,"player"));assertTrue(workspace(a).audio.playing());assertTrue(workspace(a).audio.position()>=position[0]);assertFalse(workspace(a).findViewWithTag("workspace-search").isShown());});themedScreenshot(scenario,dark,"appearance-activity-transcript-"+(dark?"dark":"light")+".png");}
     assertEquals(callReads,server.callReads.get());assertEquals(audioReads,server.audioReads.get());assertEquals(allProfiles,server.profileReads.get());
     assertEquals("\"retained\"",js(scenario,"document.getElementById('draft').value"));scenario.onActivity(a->assertSame(web.get(),a.getBridge().getWebView()));
     assertEquals(0,blocked.get());assertNull(server.failure);
    }
   }finally{
    cookie(server.origin(),"next-auth.session-token=; Path=/; Max-Age=0");assertEquals(prior,cookies(server.origin()));assertEquals(production,cookies("https://trashed.app"));
    SharedPreferences.Editor restore=prefs.edit();if(had)restore.putInt(MainActivity.ONBOARDING_VERSION_KEY,old);else restore.remove(MainActivity.ONBOARDING_VERSION_KEY);assertTrue(restore.commit());
   }
  }finally{shell("cmd uimode night "+originalMode);assertEquals("Night mode: "+originalMode,shell("cmd uimode night"));}
 }
}
