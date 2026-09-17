package com.trashed.driver;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeWorkspaceRouteTest {
    private final String origin = "https://trashed.app", source = origin + "/vendor/orders?draft=1";
    @Test public void supportedSelectionsOwnDestinationNotSource() {
        for (String id : new String[]{"vendor-profile", "vendor-call-history"}) {
            NativeWorkspaceRoute route = NativeWorkspaceRoute.select(id, source, origin, "session", 4);
            assertNotNull(route); assertEquals(source, route.source); assertNotEquals(source, route.url);
            assertTrue(route.valid(source, "session", 4));
        }
    }
    @Test public void revokeOnLogoutScopeOrDocumentDeparture() {
        NativeWorkspaceRoute route = NativeWorkspaceRoute.select("vendor-profile", source, origin, "session", 4);
        assertFalse(route.valid(source, "", 4)); assertFalse(route.valid(source, "other-account", 4));
        assertFalse(route.valid(source, "session", 5)); assertFalse(route.valid(origin + "/vendor", "session", 4));
    }
    @Test public void identityIncludesTenantAndAuthenticationCookies() {
        String session = NativeWorkspacePolicy.identityFingerprint("next-auth.session-token=one; impersonate-vendor-user-uuid=a");
        assertNotEquals(session, NativeWorkspacePolicy.identityFingerprint("next-auth.session-token=one; impersonate-vendor-user-uuid=b"));
        assertNotEquals(session, NativeWorkspacePolicy.identityFingerprint("next-auth.session-token=two; impersonate-vendor-user-uuid=a"));
        assertEquals("", NativeWorkspacePolicy.identityFingerprint("impersonate-vendor-user-uuid=a"));
    }
    @Test public void unsupportedAndUnauthenticatedActionsAreNotClaimed() {
        assertNull(NativeWorkspaceRoute.select("vendor-orders", source, origin, "session", 4));
        assertNull(NativeWorkspaceRoute.select("vendor-profile", source, origin, "", 4));
        assertNull(NativeWorkspaceRoute.select("vendor-profile", "https://evil.test/vendor", origin, "session", 4));
    }
}
