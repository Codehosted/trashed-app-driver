package com.trashed.driver;

import static org.junit.Assert.*;
import org.junit.Test;

public class NativeDockAvatarPolicyTest {
    private static final String ORIGIN = "https://trashed.app";

    @Test public void savedRelativeAndSameOriginImagesRetainTheirExactPathAndQuery() {
        assertEquals("https://trashed.app/uploads/avatar.png?v=2", NativeDockAvatarPolicy.imageURL("/uploads/avatar.png?v=2", ORIGIN));
        assertEquals("https://trashed.app/user-image?id=12", NativeDockAvatarPolicy.imageURL("https://trashed.app/user-image?id=12", ORIGIN));
        assertEquals("https://preview.trashed.app/avatar.png", NativeDockAvatarPolicy.imageURL("/avatar.png", "https://preview.trashed.app"));
    }
    @Test public void savedDiceBearSelectionRequestsPngWithIdenticalSeedAndOptions() {
        String query = "seed=Jane%20Doe-3&backgroundColor=transparent&size=120&accessories=eyepatch%2Cwayfarers&accessoriesChance=30";
        assertEquals("https://api.dicebear.com/7.x/avataaars/png?" + query,
            NativeDockAvatarPolicy.imageURL("https://api.dicebear.com/7.x/avataaars/svg?" + query, ORIGIN));
        assertEquals("https://api.dicebear.com/7.x/initials/png?seed=One%2BTwo&fontSize=40",
            NativeDockAvatarPolicy.imageURL("https://api.dicebear.com/7.x/initials/svg?seed=One%2BTwo&fontSize=40", ORIGIN));
    }
    @Test public void supportedSavedImageHostsAreNotMistakenForArbitraryURLs() {
        for (String url : new String[]{
            "https://assets.public.blob.vercel-storage.com/photo.webp",
            "https://lh3.googleusercontent.com/a/photo=s96-c",
            "https://avatars.githubusercontent.com/u/12?v=4",
            "https://api.dicebear.com/7.x/bottts/png?seed=robot"
        }) assertEquals(url, NativeDockAvatarPolicy.imageURL(url, ORIGIN));
    }
    @Test public void loopbackTestOriginDoesNotPermitArbitraryCleartextImages() {
        assertEquals("http://127.0.0.1:3423/avatar.png", NativeDockAvatarPolicy.imageURL("/avatar.png", "http://127.0.0.1:3423"));
        assertNull(NativeDockAvatarPolicy.imageURL("http://example.com/avatar.png", "http://127.0.0.1:3423"));
        assertNull(NativeDockAvatarPolicy.imageURL("http://127.0.0.1:9999/avatar.png", "http://127.0.0.1:3423"));
        assertNull(NativeDockAvatarPolicy.imageURL("/avatar.png", "http://trashed.app"));
        assertNull(NativeDockAvatarPolicy.imageURL("http://127.0.0.1/avatar.png", ORIGIN));
    }
    @Test public void rejectsMalformedAndUntrustedURLsWithoutRepairingThem() {
        for (String bad : new String[]{
            "", " ", " https://trashed.app/a.png", "https://trashed.app/a.png ",
            "//evil.example/a.png", "file:///tmp/a.png", "data:image/png;base64,AAA", "javascript:alert(1)",
            "https://user:pass@trashed.app/a.png", "https://trashed.app/a.png#fragment", "/a.png#x",
            "https://trashed.app.evil.example/a.png", "https://api.dicebear.com.evil.example/a.png",
            "https://public.blob.vercel-storage.com.evil.example/a.png", "https://evilgoogleusercontent.com/a.png",
            "https://evil.example/a.png", "https://127.0.0.1/a.png", "https://192.168.1.1/a.png",
            "https://api.dicebear.com:8443/7.x/avataaars/svg?seed=x",
            "/../admin", "/a/../admin", "/a/./b", "/a/%2e%2e/admin", "/a/%252e%252e/admin",
            "/a%5cb.png", "/a\\b.png", "/a%00b.png", "/bad%zz", "relative.png", "/a\nb.png"
        }) assertNull("Must reject " + bad, NativeDockAvatarPolicy.imageURL(bad, ORIGIN));
        assertNull(NativeDockAvatarPolicy.imageURL(null, ORIGIN));
        assertNull(NativeDockAvatarPolicy.imageURL("/a.png", null));
        assertNull(NativeDockAvatarPolicy.imageURL("/" + new String(new char[2050]).replace('\0', 'a'), ORIGIN));
    }
    @Test public void malformedOriginCannotAuthorizeEvenTrustedExternalImage() {
        for (String bad : new String[]{"file:///tmp", "https://user@trashed.app", "https://trashed.app/path", "https://trashed.app?x=1", "https://trashed.app#x", "https://127.0.0.1"})
            assertNull(NativeDockAvatarPolicy.imageURL("https://api.dicebear.com/7.x/avataaars/svg?seed=x", bad));
    }
    @Test public void initialsAreBoundedUnicodeAwareAndHaveNeutralFallback() {
        assertEquals("JD", NativeDockAvatarPolicy.initials(" Jane   Doe "));
        assertEquals("M", NativeDockAvatarPolicy.initials("Madonna"));
        assertEquals("AL", NativeDockAvatarPolicy.initials("Ada Byron Lovelace"));
        assertEquals("ÉÖ", NativeDockAvatarPolicy.initials("Élodie Öztürk"));
        assertEquals("JD", NativeDockAvatarPolicy.initials("Jane\u00a0Doe"));
        assertEquals("?", NativeDockAvatarPolicy.initials(null));
        assertEquals("?", NativeDockAvatarPolicy.initials("\u200b  "));
    }
}
