package com.trashed.driver;
import org.junit.Test;import org.junit.runner.RunWith;import androidx.test.ext.junit.runners.AndroidJUnit4;import androidx.test.platform.app.InstrumentationRegistry;import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class) public class NativeDashboardScreenTest {
 @Test public void nativeCanvasPeriodAndAccessibleSelection(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{try{
 NativeDashboard data=new NativeDashboard(new org.json.JSONObject("{\"version\":1,\"generatedAt\":\"2026-09-16T00:00:00Z\",\"scope\":{\"userId\":1,\"vendorId\":2},\"businessName\":\"Synthetic workspace\",\"currency\":\"USD\",\"revenue\":{\"today\":0,\"thisWeek\":0,\"thisMonth\":12,\"thisQuarter\":12,\"thisYear\":34,\"monthlyGrowthPercent\":null},\"monthlyRevenue\":[{\"month\":\"Jan\",\"revenue\":0},{\"month\":\"Feb\",\"revenue\":12}],\"rentals\":{\"total\":0,\"active\":0,\"pending\":0,\"completed\":0},\"inventory\":{\"total\":0,\"available\":0,\"rented\":0,\"maintenance\":0},\"customers\":{\"total\":0},\"inventoryByType\":[]}"));
 NativeDashboardView view=new NativeDashboardView(new NativeWorkspaceTokens(InstrumentationRegistry.getInstrumentation().getTargetContext(),false));view.show(data);assertSame(data,view.snapshot);
 android.widget.LinearLayout periods=view.findViewWithTag("dashboard-period");periods.getChildAt(1).performClick();assertTrue(view.year);assertTrue(text(view).contains("$34.00"));
 android.view.View toggle=find(view,"Show accessible chart data");assertNotNull(toggle);toggle.performClick();assertTrue(view.table);android.view.View feb=find(view,"Feb · $12.00");assertNotNull(feb);feb.performClick();assertEquals(1,view.selected);
 NativeSystemAppearance.repaint(view,true,false);assertSame(data,view.snapshot);assertEquals(1,view.selected);assertTrue(view.year);
 }catch(Exception e){throw new AssertionError(e);}});}
 static android.view.View find(android.view.View v,String text){if(v instanceof android.widget.Button && text.contentEquals(((android.widget.Button)v).getText()))return v;if(v instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)v;for(int i=0;i<g.getChildCount();i++){android.view.View r=find(g.getChildAt(i),text);if(r!=null)return r;}}return null;}
 static String text(android.view.View v){String result=v instanceof android.widget.TextView?((android.widget.TextView)v).getText().toString():"";if(v instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)v;for(int i=0;i<g.getChildCount();i++)result+=text(g.getChildAt(i));}return result;}
}
