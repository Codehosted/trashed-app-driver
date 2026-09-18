package com.trashed.driver;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.trashed.driver.NativeWorkspaceApiTest.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Production client over real loopback sockets; synthetic bounded pages only. */
public class NativeRentalsPaginationTest {
    static String cursor(int index) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(("page:"+index).getBytes(StandardCharsets.UTF_8));
    }
    static JSONObject page(int start, int count, int total, String next) throws Exception {
        JSONArray rows=new JSONArray();
        for(int i=start;i<start+count;i++) rows.put(NativeRentalsMapTest.order("rental-"+i,39.7,-86.1));
        return new JSONObject().put("version",2).put("generatedAt","2026-09-17T12:00:00Z")
            .put("scope",new JSONObject().put("userId",12).put("vendorId",29))
            .put("orders",rows).put("count",count).put("mappedCount",total)
            .put("totalRentalCount",total+1).put("unmappedCount",1)
            .put("snapshot","a".repeat(64)).put("nextCursor",next==null?JSONObject.NULL:next);
    }
    static void reject(JSONObject... pages) throws Exception {
        Reply[] replies=new Reply[pages.length];for(int i=0;i<pages.length;i++)replies[i]=json(pages[i]);
        try(Fixture f=new Fixture(replies)) {
            try { f.api().rentalsMap();fail("Invalid page chain accepted"); } catch(IOException|JSONException expected) { }
            assertTrue(f.requests.size()<=pages.length);
        }
    }
    @Test public void realLoopbackTenThousandLongDescriptionsExceedTwoMiBInTotal() throws Exception {
        List<Reply> replies=new ArrayList<>();long bytes=0;int max=0;
        // A 200-row request may return fewer rows to respect the server byte budget.
        for(int start=0;start<10000;start+=100) {
            JSONObject value=page(start,100,10000,start+100<10000?cursor(start+100):null);
            for(int i=0;i<100;i++) value.getJSONArray("orders").getJSONObject(i).put("dumpsterDescription","x".repeat(1500));
            Reply reply=json(value);assertTrue(reply.body.length<=256*1024);max=Math.max(max,reply.body.length);bytes+=reply.body.length;replies.add(reply);
        }
        assertTrue(bytes>2*1024*1024);
        try(Fixture f=new Fixture(replies.toArray(new Reply[0]))) {
            NativeRentalsMap result=f.api().rentalsMap();
            assertEquals(10000,result.count);assertEquals(10000,result.orders.size());assertEquals(10001,result.totalRentalCount);
            assertEquals("rental-9999",result.orders.get(9999).id);assertEquals(1500,result.orders.get(9999).dumpsterDescription.length());
            assertEquals(100,f.requests.size());
            for(int i=0;i<f.requests.size();i++) {
                String expected="GET /api/vendor/rentals/map?pageSize=200"+(i==0?"":"&cursor="+cursor(i*100))+" HTTP/";
                assertTrue(f.requests.get(i).startsWith(expected));
                assertTrue(f.requests.get(i).toLowerCase(Locale.ROOT).contains("cache-control: no-store"));
                assertTrue(f.requests.get(i).contains("next-auth.session-token=fixture-session"));
            }
            System.out.println("Rentals loopback: rows="+result.count+", pages="+f.requests.size()+", totalBytes="+bytes+", maxPageBytes="+max);
        }
    }
    @Test public void rejectsRepeatedCursorNoProgressDuplicatesAndPrematureTerminal() throws Exception {
        reject(page(0,1,3,cursor(1)),page(1,1,3,cursor(1)));
        reject(page(0,0,3,cursor(1)));
        reject(page(0,1,3,cursor(1)),page(1,0,3,cursor(2)));
        reject(page(0,1,2,cursor(1)),page(0,1,2,null));
        reject(page(0,1,3,null));
        reject(page(0,1,2,cursor(1)),page(1,0,2,null));
        reject(page(0,1,1,cursor(1)));
        reject(page(0,1,2,cursor(1)),NativeRentalsMapTest.snapshot());
        reject(page(0,201,201,null));
    }
    @Test public void rejectsMixedSnapshotScopeAndTotals() throws Exception {
        JSONObject first=page(0,1,2,cursor(1));
        reject(first,page(1,1,2,null).put("snapshot","b".repeat(64)));
        reject(first,page(1,1,3,null));
        reject(first,page(1,1,2,null).put("unmappedCount",2).put("totalRentalCount",4));
        JSONObject changed=page(1,1,2,null);changed.getJSONObject("scope").put("vendorId",30);
        try(Fixture f=new Fixture(json(first),json(changed))) {
            try { f.api().rentalsMap();fail(); } catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
        }
    }
    @Test public void exactAllowlistAndCanonicalOpaqueCursor() throws Exception {
        for(int length=1;length<=256;length++) for(char tail:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray()) {
            String value="A".repeat(length-1)+tail;boolean canonical;
            try {canonical=Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(value)).equals(value);}
            catch(IllegalArgumentException error){canonical=false;}
            assertEquals(canonical,NativeRentalsMap.validCursor(value));
        }
        assertTrue(NativeWorkspaceApi.rentalsMapPath("/api/vendor/rentals/map?pageSize=200"));
        assertTrue(NativeWorkspaceApi.rentalsMapPath("/api/vendor/rentals/map?pageSize=200&cursor="+cursor(1)));
        for(String value:new String[]{"a","Zh","Zg=","Zg==","../x","ab&vendorId=30","ab#x","a".repeat(257),""}) {
            assertFalse(NativeRentalsMap.validCursor(value));
            reject(page(0,1,2,value));
        }
        for(String path:new String[]{"/api/vendor/rentals/map-other?pageSize=200","/api/vendor/rentals/map?pageSize=200&vendorId=30","/api/vendor/rentals/map?pageSize=200&cursor=Zg&extra=1","/api/vendor/rentals/map?pageSize=201","/api/vendor/rentals/map?pageSize=200#x"})
            assertFalse(NativeWorkspaceApi.rentalsMapPath(path));
        JSONObject missing=page(0,0,0,null);missing.remove("nextCursor");reject(missing);
        reject(page(0,0,0,null).put("snapshot","A".repeat(64)));
        try(Fixture f=new Fixture(json(page(0,0,0,null)))) {assertEquals(0,f.api().rentalsMap().count);}
    }
    @Test public void byteCapsRemainRealAnd409IsRentalsSpecific() throws Exception {
        for(int size:new int[]{256*1024,2*1024*1024}) {
            JSONObject value=page(0,1,1,null).put("padding","x".repeat(size));
            if(size>256*1024)value.put("version",1);
            try(Fixture f=new Fixture(json(value))) {
                try {f.api().rentalsMap();fail();} catch(IOException expected){assertTrue(expected.getMessage().contains(size>256*1024?"too large":"256 KiB"));}
            }
        }
        try(Fixture f=new Fixture(new Reply(409,"application/json","{}"))) {
            try {f.api().rentalsMap();fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(409,expected.status);assertEquals("Rentals map changed. Please retry.",expected.getMessage());}
        }
    }
    @Test public void aggregateMemoryEnvelopeFailsWithoutPublishingPartialData() throws Exception {
        final long[] bytes={0}; final int[] opened={0};
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app",url->"next-auth.session-token=fixture-A",url->{
            int index=opened[0]++;
            try {
                JSONObject value=page(index*100,100,20000,index<199?cursor((index+1)*100):null);
                for(int i=0;i<100;i++) value.getJSONArray("orders").getJSONObject(i).put("dumpsterDescription","x".repeat(1500));
                Reply reply=json(value); bytes[0]+=reply.body.length;
                return new SaveConnection(url,reply);
            } catch(Exception error) {throw new IOException(error);}
        });
        try {api.rentalsMap();fail("Unbounded aggregate was published");}
        catch(IOException expected) {assertTrue(expected.getMessage().contains("memory limit"));}
        assertTrue(bytes[0]>32L*1024*1024);
        assertTrue(bytes[0]<=32L*1024*1024+256*1024);
        assertTrue(opened[0]<200);
    }
    @Test public void cancellationAtPageBoundariesNeverReturnsPartialSnapshot() throws Exception {
        for(int stopAfter:new int[]{1,2}) for(boolean cancel:new boolean[]{true,false}) {
            NativeWorkspaceApi[] api={null};int[] opened={0};String[] cookie={"next-auth.session-token=fixture-A"};
            api[0]=new NativeWorkspaceApi("https://trashed.app",url->cookie[0],url->{
                int index=++opened[0];
                Reply reply;
                try {reply=json(page(index-1,1,2,index==1?cursor(1):null));}catch(Exception e){throw new IOException(e);}
                return new SaveConnection(url,reply) {
                    @Override public InputStream getInputStream(){return new ByteArrayInputStream(reply.body){
                        @Override public void close(){if(index==stopAfter){if(cancel)api[0].cancel();else cookie[0]="next-auth.session-token=fixture-B";}}
                    };}
                };
            });
            try {api[0].rentalsMap();fail("published cancelled/changed aggregate");}catch(IOException expected){
                if(cancel)assertEquals("Cancelled",expected.getMessage());else assertEquals(401,((NativeWorkspaceApi.Failure)expected).status);
            }
            assertEquals(stopAfter,opened[0]);
        }
    }
}
