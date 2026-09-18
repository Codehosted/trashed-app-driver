package com.trashed.driver;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;

/** Synthetic DTOs only; production model and real loopback transport. */
public class NativeRentalsMapTest {
    static JSONObject order(String id, double lat, double lng) throws Exception {
        return new JSONObject().put("id",id).put("label","20 yard rental").put("status","active")
            .put("customerName","Synthetic customer").put("address","Fixture Avenue").put("confirmationCode","TEST-42")
            .put("href","/vendor/rentals/"+id).put("lat",lat).put("lng",lng).put("totalPrice","120.00");
    }
    static JSONObject snapshot() throws Exception {
        return new JSONObject().put("version",1).put("generatedAt","2026-09-17T12:00:00.000Z")
            .put("scope",new JSONObject().put("userId",12).put("vendorId",29))
            .put("orders",new JSONArray().put(order("fixture-a",39.7,-86.1)).put(order("fixture-b",40,-85.9)))
            .put("count",2).put("totalRentalCount",3).put("unmappedCount",1);
    }
    interface Mutation { void change(JSONObject json) throws Exception; }
    static void rejects(Mutation mutation) throws Exception {
        JSONObject value=snapshot();mutation.change(value);
        try { new NativeRentalsMap(value); fail("Malformed map accepted"); } catch(IOException|JSONException expected) { }
    }
    @Test public void validImmutableSnapshotAndLiteralSearch() throws Exception {
        JSONObject json=snapshot();NativeRentalsMap result=new NativeRentalsMap(json);
        json.getJSONArray("orders").getJSONObject(0).put("label","changed");
        assertEquals("20 yard rental",result.orders.get(0).label);
        assertEquals(2,result.filtered("SYNTHETIC","all").size());
        assertEquals(2,result.filtered("test-42","active").size());
        assertEquals(0,result.filtered("","completed").size());
        assertEquals(0,result.filtered("%","all").size());
        assertEquals(1,result.unmappedCount);
        try { result.orders.clear();fail(); } catch(UnsupportedOperationException expected) { }
    }
    @Test public void strictEnvelopeCountsVersionAndScope() throws Exception {
        rejects(v->v.put("version",2)); rejects(v->v.put("generatedAt","yesterday"));
        rejects(v->v.put("count",3)); rejects(v->v.put("unmappedCount",2));
        rejects(v->v.put("totalRentalCount",2)); rejects(v->v.put("count","2"));
        rejects(v->v.put("unmappedCount",-1)); rejects(v->v.put("count",2.5));
        rejects(v->v.getJSONObject("scope").put("userId",0));
        rejects(v->v.getJSONObject("scope").put("vendorId","29"));
        rejects(v->v.getJSONObject("scope").put("vendorId",9007199254740992d));
    }
    @Test public void strictCoordinatesIdsAndText() throws Exception {
        for(Object value:new Object[]{"39.7",true,JSONObject.NULL,91,-91}) rejects(v->v.getJSONArray("orders").getJSONObject(0).put("lat",value));
        for(Object value:new Object[]{181,-181,"NaN",JSONObject.NULL}) rejects(v->v.getJSONArray("orders").getJSONObject(0).put("lng",value));
        for(String id:new String[]{"","../x","x/y"," x","x\n"}) rejects(v->v.getJSONArray("orders").getJSONObject(0).put("id",id));
        rejects(v->v.getJSONArray("orders").getJSONObject(1).put("id","fixture-a"));
        rejects(v->v.getJSONArray("orders").getJSONObject(0).put("label",12));
        rejects(v->v.getJSONArray("orders").getJSONObject(0).put("totalPrice",true));
        JSONObject zero=snapshot();zero.getJSONArray("orders").getJSONObject(0).put("lat",0).put("lng",0);
        assertEquals(0,new NativeRentalsMap(zero).orders.get(0).lat,0);
    }
    @Test public void hrefCannotEscapeRentals() throws Exception {
        for(String href:new String[]{"https://evil.test/vendor/rentals/a","//evil.test","/vendor/rentals-other/a","/vendor/rentals/../profile","/vendor/rentals/%2e%2e","/vendor/rentals/a#x","/vendor/rentals/a?redirect=https://evil.test","/vendor/rentals/a\\b","javascript:alert(1)"})
            rejects(v->v.getJSONArray("orders").getJSONObject(0).put("href",href));
    }
    @Test public void scopeChangeRejectsRatherThanMerges() throws Exception {
        NativeRentalsMap previous=new NativeRentalsMap(snapshot());
        JSONObject changed=snapshot();changed.getJSONObject("scope").put("vendorId",30);
        try { new NativeRentalsMap(changed).requireSameScope(previous);fail(); }
        catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
    }
    @Test public void endpointUsesReadOnlyScopedTransport() throws Exception {
        NativeWorkspaceApiTest.MutableCookies cookies=new NativeWorkspaceApiTest.MutableCookies();
        try(NativeWorkspaceApiTest.Fixture fixture=new NativeWorkspaceApiTest.Fixture(new NativeWorkspaceApiTest.Reply(200,"application/json",snapshot().toString(),NativeWorkspaceApiTest.ROTATION))) {
            NativeRentalsMap result=new NativeWorkspaceApi(fixture.origin,cookies).rentalsMap();
            assertEquals(2,result.orders.size()); assertEquals(1,fixture.requests.size());
            String request=fixture.requests.get(0);
            assertTrue(request.startsWith("GET /api/vendor/rentals/map?pageSize=200 HTTP/"));
            assertFalse(request.toLowerCase().contains("x-vendor"));
            assertTrue(request.toLowerCase().contains("cache-control: no-store"));
            assertEquals("next-auth.session-token=fixture-A",cookies.value);assertTrue(cookies.received.isEmpty());
        }
    }
    @Test public void endpointErrorsAreNotEmptyMaps() throws Exception {
        for(int code:new int[]{401,403,404,500,302}) try(NativeWorkspaceApiTest.Fixture fixture=new NativeWorkspaceApiTest.Fixture(new NativeWorkspaceApiTest.Reply(code,"application/json","{}"))) {
            try { fixture.api().rentalsMap();fail(); } catch(NativeWorkspaceApi.Failure expected){assertEquals(code,expected.status);}
        }
    }
    @Test public void exactNativeRouteAndMenuLease() {
        String origin="https://trashed.app";
        assertEquals("rentals",NativeWorkspacePolicy.destination(origin+"/vendor/rentals",origin));
        for(String path:new String[]{"/vendor/rentals/a","/vendor/rentals/","/vendor/rentals-extra","/vendor/rentals?view=list"})
            assertEquals("",NativeWorkspacePolicy.destination(origin+path,origin));
        assertEquals("",NativeWorkspacePolicy.destination("https://evil.test/vendor/rentals",origin));
        NativeWorkspaceRoute route=NativeWorkspaceRoute.select("vendor-rentals",origin+"/vendor/assistant",origin,"session",4);
        assertNotNull(route); assertEquals("rentals",route.destination); assertEquals(origin+"/vendor/rentals",route.url);
        assertTrue(route.valid(origin+"/vendor/assistant","session",4));
        assertFalse(route.valid(origin+"/vendor/assistant","other",4));
        assertFalse(route.valid(origin+"/vendor/assistant","session",5));
    }
    @Test public void viewportAcceptsZeroClampsPolesAndRejectsInvalid() {
        assertArrayEquals(new double[]{.5,.5},NativeMapViewport.point(0,0),.000001);
        assertNotNull(NativeMapViewport.point(90,180));
        assertNull(NativeMapViewport.point(91,0));
        assertNull(NativeMapViewport.point(0,Double.NaN));
        assertTrue(Double.isFinite(NativeMapViewport.point(-90,0)[1]));
    }
    @Test public void viewportFitsDateLineAndWidelySeparatedPins() {
        java.util.List<double[]> points=java.util.Arrays.asList(NativeMapViewport.point(0,179),NativeMapViewport.point(0,-179));
        NativeMapViewport.Fit fit=NativeMapViewport.fit(points,300,300);
        assertTrue(Math.abs(NativeMapViewport.delta(fit.x,0))<.001);
        for(double[] p:points)assertTrue(Math.abs(NativeMapViewport.delta(p[0],fit.x))*(256L<<fit.zoom)<=150);
        points=java.util.Arrays.asList(NativeMapViewport.point(40,-120),NativeMapViewport.point(-40,60));
        fit=NativeMapViewport.fit(points,600,600);
        for(double[] p:points){
            assertTrue(Math.abs(NativeMapViewport.delta(p[0],fit.x))*(256L<<fit.zoom)<=300);
            assertTrue(Math.abs(p[1]-fit.y)*(256L<<fit.zoom)<=300);
        }
    }
    @Test public void viewportEmptyAndCoincidentPointsRemainFinite() {
        assertEquals(2,NativeMapViewport.fit(java.util.Collections.emptyList(),0,0).zoom);
        double[] point=NativeMapViewport.point(39.7,-86.1);
        NativeMapViewport.Fit fit=NativeMapViewport.fit(java.util.Arrays.asList(point,point),300,300);
        assertEquals(16,fit.zoom);assertEquals(point[0],fit.x,.000001);assertEquals(point[1],fit.y,.000001);
    }
}
