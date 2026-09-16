package com.trashed.driver;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeWorkspacePolicyTest {
    private final String origin = "https://trashed.app";
    @Test public void preservesUnconvertedProfileAndDriverActions() {
        assertEquals("profile", NativeWorkspacePolicy.destination(origin + "/vendor/profile", origin));
        assertEquals("profile", NativeWorkspacePolicy.destination(origin + "/vendor/profile?view=about", origin));
        for (String path : new String[]{"/vendor/profile?view=account", "/vendor/profile?view=inbox", "/vendor/profile?view=team", "/vendor/profile?view=access", "/vendor/profile/preferences", "/driver?view=profile", "/driver/profile"})
            assertEquals(path, "", NativeWorkspacePolicy.destination(origin + path, origin));
        assertEquals("calls", NativeWorkspacePolicy.destination(origin + "/calls/history", origin));
        assertEquals("calls", NativeWorkspacePolicy.destination(origin + "/vendor/trisha/calls", origin));
        assertEquals("", NativeWorkspacePolicy.destination("https://trashed.app.evil/vendor/profile", origin));
    }
    @Test public void onlySameOriginRecordingEndpointsAreAccepted() {
        String path = "/api/calls/a1234567-89ab-cdef-0123-456789abcdef/recording";
        assertEquals(origin + path, NativeWorkspacePolicy.recording(origin,path).toString());
        assertEquals(origin + path, NativeWorkspacePolicy.recording(origin,origin+path).toString());
        for (String value : new String[]{"https://evil.test"+path, "http://trashed.app"+path, "//trashed.app"+path, "https://u@trashed.app"+path, path+"?next=other", path+"#bad", "/api/calls/%2f/recording", "/api/calls/%252f/recording", "/api/calls/%2e%2e/recording", "/api/calls/../recording", "/api/user/profile"}) {
            try { NativeWorkspacePolicy.recording(origin,value); fail("Accepted " + value); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void authFingerprintIncludesWorkspaceButNotAnalytics() {
        String base="next-auth.session-token.0=fixture-a; next-auth.session-token.1=fixture-b";
        String value=NativeWorkspacePolicy.identityFingerprint(base);
        assertFalse(value.isEmpty());assertFalse(value.contains("fixture-a"));
        assertEquals(value,NativeWorkspacePolicy.identityFingerprint("_ga=changed; "+base));
        assertNotEquals(value,NativeWorkspacePolicy.identityFingerprint(base+"; impersonate-vendor-user-uuid=other"));
        assertNotEquals(value,NativeWorkspacePolicy.identityFingerprint(base.replace("fixture-a","new-session")));
        assertEquals("",NativeWorkspacePolicy.identityFingerprint("impersonate-vendor-user-uuid=other; theme=dark"));
        assertEquals("",NativeWorkspacePolicy.identityFingerprint("next-auth.session-token.bad=fixture"));
    }
    @Test public void searchUsesEncodedQueryAndValidFilters() {
        String path = NativeWorkspacePolicy.callsPath(2,"a&b + c","ended","timestamp-desc");
        assertEquals("a&b + c", NativeWorkspacePolicy.query(origin+path,"search",""));
        for (int page : new int[]{0,-1}) {
            try { NativeWorkspacePolicy.callsPath(page,"","all","timestamp-desc"); fail(); } catch (IllegalArgumentException expected) { }
        }
    }
}
