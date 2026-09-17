package com.trashed.driver;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;
public class NativeDashboardTest {
 public static JSONObject fixture() throws Exception {return new JSONObject("{\"version\":1,\"generatedAt\":\"2026-09-16T00:00:00Z\",\"scope\":{\"userId\":1,\"vendorId\":2},\"businessName\":\"Fixture\",\"currency\":\"USD\",\"revenue\":{\"today\":0,\"thisWeek\":0,\"thisMonth\":0,\"thisQuarter\":0,\"thisYear\":0,\"monthlyGrowthPercent\":null},\"monthlyRevenue\":[],\"rentals\":{\"total\":0,\"active\":0,\"pending\":0,\"completed\":0},\"inventory\":{\"total\":0,\"available\":0,\"rented\":0,\"maintenance\":0},\"customers\":{\"total\":0},\"inventoryByType\":[]}");}
 @Test public void zeroIsValid()throws Exception{assertEquals(2,new NativeDashboard(fixture()).vendorId);}
 @Test public void rejectsVersion()throws Exception{try{new NativeDashboard(fixture().put("version",2));fail();}catch(java.io.IOException expected){}}
 @Test public void rejectsScopeChange()throws Exception{NativeDashboard a=new NativeDashboard(fixture());JSONObject b=fixture();b.getJSONObject("scope").put("vendorId",3);try{new NativeDashboard(b).requireSameScope(a);fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}}
 @Test public void rejectsMissingCounts()throws Exception{JSONObject b=fixture();b.getJSONObject("customers").remove("total");try{new NativeDashboard(b);fail();}catch(JSONException expected){}}
 @Test public void directRouteKeepsSource(){NativeWorkspaceRoute r=NativeWorkspaceRoute.select("vendor-dashboard","https://trashed.app/vendor","https://trashed.app","session",7);assertNotNull(r);assertEquals("https://trashed.app/vendor/dashboard",r.url);assertTrue(r.valid("https://trashed.app/vendor","session",7));assertFalse(r.valid("https://trashed.app/vendor","other",7));}
}
