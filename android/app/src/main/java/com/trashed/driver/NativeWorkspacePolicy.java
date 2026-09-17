package com.trashed.driver;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.Arrays;

/** Pure policy: only named API routes receive the WebView's session. */
final class NativeWorkspacePolicy {
    static String destination(String url, String origin) {
        if (!NativeWorkspaceHistory.isSameOriginURL(url, origin)) return "";
        try {
            URI uri = new URI(url);
            String path = uri.getRawPath();
            if ("/vendor/dashboard".equals(path)) return "dashboard";
            if ("/vendor/profile".equals(path) && Arrays.asList("", "about").contains(query(url, "view", ""))) return "profile";
            if ("/calls/history".equals(path) || "/vendor/trisha/calls".equals(path)) return "calls";
        } catch (Exception ignored) { }
        return "";
    }
    static String selection(String id) {
        if ("vendor-dashboard".equals(id)) return "dashboard";
        if ("vendor-profile".equals(id)) return "profile";
        return "vendor-call-history".equals(id) ? "calls" : "";
    }
    static String query(String url, String name, String fallback) {
        try {
            String query = new URI(url).getRawQuery();
            if (query != null) for (String pair : query.split("&")) {
                String[] parts = pair.split("=", 2);
                if (name.equals(URLDecoder.decode(parts[0], "UTF-8")))
                    return parts.length == 2 ? URLDecoder.decode(parts[1], "UTF-8") : "";
            }
        } catch (Exception ignored) { }
        return fallback;
    }
    static String callsPath(int page, String search, String filter, String sort) {
        if (page < 1 || !Arrays.asList("all", "completed", "ended", "finished", "in-progress", "failed", "ringing").contains(filter)
            || !Arrays.asList("timestamp-desc", "timestamp-asc", "duration-desc", "duration-asc", "customerName-asc", "customerName-desc", "status-asc", "status-desc").contains(sort))
            throw new IllegalArgumentException("Invalid call filters");
        try { return "/api/ai-features/calls?page=" + page + "&search=" + URLEncoder.encode(search, "UTF-8") + "&filter=" + filter + "&sort=" + sort; }
        catch (java.io.UnsupportedEncodingException impossible) { throw new AssertionError(impossible); }
    }
    static URI recording(String origin, String value) {
        try {
            URI base = new URI(origin), raw = new URI(value), result = base.resolve(raw);
            boolean same = NativeWorkspaceHistory.isSameOriginURL(result.toString(), origin);
            boolean local = "http".equals(result.getScheme()) && same
                && ("localhost".equals(result.getHost()) || "127.0.0.1".equals(result.getHost()) || "10.0.2.2".equals(result.getHost()));
            if ((!"https".equals(result.getScheme()) && !local) || result.getHost() == null || result.getUserInfo() != null
                || result.getFragment() != null || value.startsWith("//") || value.contains("\\")) throw new IllegalArgumentException();
            // Only authenticated application recording endpoints, never provider URLs.
            if (!same || result.getRawQuery() != null || !result.getRawPath().matches("/api/calls/[A-Za-z0-9_-]+/recording")) throw new IllegalArgumentException();
            return result;
        } catch (Exception error) { throw new IllegalArgumentException("Recording URL is not supported"); }
    }
    static boolean validEmail(String value) { return value.length() <= 254 && value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"); }
    static String identityFingerprint(String cookies) {
        java.util.List<String> parts = new java.util.ArrayList<>();
        boolean hasSession = false;
        for (String part : (cookies == null ? "" : cookies).split(";")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length != 2 || pair[1].isEmpty()) continue;
            boolean session = pair[0].matches("(?:__Secure-)?(?:next-auth|authjs)\\.session-token(?:\\.[0-9]+)?");
            if (session || pair[0].equals("impersonate-vendor-user-uuid") || pair[0].equals("doc-mode")) parts.add(part.trim());
            hasSession |= session;
        }
        if (!hasSession) return "";
        java.util.Collections.sort(parts);
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(String.join(";", parts).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    static String duration(int seconds) { return String.format(java.util.Locale.ROOT, "%d:%02d", Math.max(0, seconds) / 60, Math.max(0, seconds) % 60); }
}
