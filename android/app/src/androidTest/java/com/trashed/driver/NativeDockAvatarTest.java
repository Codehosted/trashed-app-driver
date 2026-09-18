package com.trashed.driver;

import static org.junit.Assert.*;
import android.content.Intent;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import java.util.*;
import org.junit.Test;

public class NativeDockAvatarTest {
    private static Map<String,Object> map(Object... pairs) {
        Map<String,Object> result = new HashMap<>();
        for (int i=0;i<pairs.length;i+=2) result.put((String)pairs[i],pairs[i+1]);
        return result;
    }
    private static NativeNavigationState state() {
        return new NativeNavigationState(map("version",1,"context","avatar-test","revision",1,"visible",true,"appearance","light","tabs",Arrays.asList(
            map("id","vendor-assistant","label","Assistant","icon","assistant","badge",0,"selected",true,"items",Collections.emptyList()),
            map("id","account","label","Account","icon","account","badge",0,"selected",false,"items",Collections.emptyList()))));
    }
    private static Bitmap raster(Drawable drawable) {
        Bitmap image=Bitmap.createBitmap(96,96,Bitmap.Config.ARGB_8888);
        drawable.setBounds(0,0,96,96); drawable.draw(new Canvas(image)); return image;
    }
    @Test public void materialKeepsRasterColorsAndGifFramesAndStopsOnKeyboardAndReset() {
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NavigationTestActivity.class);
        try (ActivityScenario<NavigationTestActivity> scenario=ActivityScenario.launch(intent)) {
            final NativeDockAvatar[] avatar = new NativeDockAvatar[1];
            final Bitmap[] first = new Bitmap[1];
            scenario.onActivity(activity -> {
                activity.navigation.set(state(),new NativeBottomNavigation.Listener() {
                    public void select(NativeNavigationState.Selection value) { }
                    public void reset(String context) { }
                });
                BottomNavigationView bar=activity.findViewById(android.R.id.content).findViewWithTag("native-bottom-navigation");
                assertNull(bar.getItemIconTintList()); assertEquals("Trisha",bar.getMenu().getItem(0).getTitle());
                avatar[0]=(NativeDockAvatar)bar.getMenu().getItem(0).getIcon();
                assertNotNull(avatar[0].getCallback());
                org.junit.Assume.assumeTrue("System animation setting is disabled",avatar[0].running());
                first[0]=raster(avatar[0]);
                int background=first[0].getPixel(48,5);
                assertTrue("Transparent source background must use brand matte, not chroma green",
                    Color.red(background)>210 && Color.green(background)>210 && Color.blue(background)>230);
                Set<Integer> colors=new HashSet<>();
                for(int y=8;y<88;y++) for(int x=8;x<88;x++) colors.add(first[0].getPixel(x,y));
                assertTrue("Raster must not be flat navigation tint",colors.size()>32);
            });
            SystemClock.sleep(850);
            scenario.onActivity(activity -> {
                assertTrue(avatar[0].frameTime()>0);
                assertFalse("Bundled GIF must advance visible pixels",first[0].sameAs(raster(avatar[0])));
                activity.navigation.keyboard(true); assertFalse(avatar[0].running());
                activity.navigation.keyboard(false); assertTrue(avatar[0].running());
                activity.navigation.reset(); assertFalse(avatar[0].running());
                activity.navigation.dispose();
            });
        }
    }
    @Test public void authenticatedProfileLoadsCookieFreeAvatarAndScopeChangeClearsIt() throws Exception {
        java.net.HttpURLConnection ready = (java.net.HttpURLConnection)new java.net.URL("http://127.0.0.1:3424/__health").openConnection();
        try { assertEquals(200, ready.getResponseCode()); } finally { ready.disconnect(); }
        final java.util.concurrent.atomic.AtomicReference<String> identity = new java.util.concurrent.atomic.AtomicReference<>("account-a");
        final NativeDockAvatar[] account = new NativeDockAvatar[1];
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), NavigationTestActivity.class);
        try (ActivityScenario<NavigationTestActivity> scenario = ActivityScenario.launch(intent)) {
            scenario.onActivity(activity -> {
                activity.navigation.avatarHost(new NativeDockAvatarLoader.Host() {
                    public String origin() { return "http://127.0.0.1:3424"; }
                    public String identity() { return identity.get(); }
                    public long document() { return 1; }
                    public NativeWorkspaceApi.CookieSource cookies() { return url -> "next-auth.session-token=local-avatar-fixture"; }
                });
                activity.navigation.set(state(), new NativeBottomNavigation.Listener() {
                    public void select(NativeNavigationState.Selection value) { }
                    public void reset(String context) { }
                });
                BottomNavigationView bar = activity.findViewById(android.R.id.content).findViewWithTag("native-bottom-navigation");
                account[0] = (NativeDockAvatar)bar.getMenu().getItem(1).getIcon();
            });
            final boolean[] loaded = {false};
            for (int i=0; i<100 && !loaded[0]; i++) {
                scenario.onActivity(activity -> loaded[0] = raster(account[0]).getPixel(48,48) == Color.rgb(18,166,147));
                if (!loaded[0]) SystemClock.sleep(100);
            }
            assertTrue("Saved profile image should render, not initials or owner photo", loaded[0]);
            NativeWorkspaceRegressionTest.screenshot("dock-avatar-profile.png");
            java.net.HttpURLConnection trace = (java.net.HttpURLConnection)new java.net.URL("http://127.0.0.1:3424/__state").openConnection();
            String body;
            try (java.io.InputStream stream=trace.getInputStream(); java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()) {
                byte[] buffer=new byte[4096]; int count; while((count=stream.read(buffer))!=-1) bytes.write(buffer,0,count);
                body=bytes.toString("UTF-8");
            } finally { trace.disconnect(); }
            org.json.JSONArray requests=new org.json.JSONObject(body).getJSONArray("requests");
            boolean authenticated=false, cookieFree=false;
            for(int i=0;i<requests.length();i++) {
                org.json.JSONObject request=requests.getJSONObject(i);
                if("/api/user/profile".equals(request.getString("path"))) authenticated|=request.getBoolean("cookiePresent");
                if("/avatar.png".equals(request.getString("path"))) {
                    assertFalse(request.getBoolean("cookiePresent")); assertFalse(request.getBoolean("authorizationPresent")); cookieFree=true;
                }
            }
            assertTrue(authenticated); assertTrue(cookieFree);
            scenario.onActivity(activity -> { identity.set(""); activity.navigation.resume();
                assertNotEquals("Retired account image must clear immediately",Color.rgb(18,166,147),raster(account[0]).getPixel(48,48));
                activity.navigation.dispose();
            });
        }
    }

    @Test public void disposedLeaseRejectsQueuedResultAndClearsPhoto() throws Exception {
        final int[] delivered={0}; final NativeDockAvatarLoader[] loader={null};
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            loader[0]=new NativeDockAvatarLoader(new NativeDockAvatarLoader.Host() {
                public String origin(){return "https://example.com";}
                public String identity(){return "session";}
                public long document(){return 1;}
                public NativeWorkspaceApi.CookieSource cookies(){return url -> "";}
            },(bitmap,name)->delivered[0]++);
            try {
                java.lang.reflect.Method deliver=NativeDockAvatarLoader.class.getDeclaredMethod("deliver",long.class,String.class,Bitmap.class,String.class);
                deliver.setAccessible(true); deliver.invoke(loader[0],0L,"old-session",null,"Old account");
            } catch(Exception error){throw new AssertionError(error);}
            loader[0].dispose();
        });
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertEquals("Only immediate clear is delivered",1,delivered[0]);
    }
}
