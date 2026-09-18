package com.trashed.driver;

import java.net.URI;
import java.util.Locale;

/** Pure allowlist for saved profile images. Never an authority or cookie policy. */
final class NativeDockAvatarPolicy {
    private NativeDockAvatarPolicy() { }

    static String imageURL(String raw, String origin) {
        if (raw == null || origin == null || raw.isEmpty() || raw.length() > 2048 || forbiddenCharacters(raw)) return null;
        try {
            URI base = new URI(origin);
            if (!validOrigin(base)) return null;
            URI value = new URI(raw);
            if (value.getRawUserInfo() != null || value.getRawFragment() != null) return null;
            boolean relative = !value.isAbsolute();
            if (relative && (!raw.startsWith("/") || raw.startsWith("//") || value.getRawAuthority() != null)) return null;
            // Inspect before resolve(): URI.resolve normalizes dot segments.
            if (!safePath(value.getRawPath())) return null;
            URI url = relative ? base.resolve(value) : value;
            String host = url.getHost();
            if (host == null || url.getRawUserInfo() != null || url.getRawFragment() != null) return null;
            host = host.toLowerCase(Locale.ROOT);
            if (!sameOrigin(url, base)) {
                if (!"https".equals(url.getScheme()) || (url.getPort() != -1 && url.getPort() != 443)) return null;
                boolean known = host.equals("api.dicebear.com") || host.equals("avatars.githubusercontent.com")
                    || host.matches("lh[0-9]+\\.googleusercontent\\.com")
                    || host.matches("[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com");
                if (!known) return null;
            }
            String path = url.getRawPath();
            if (host.equals("api.dicebear.com") && path.matches("/[0-9]+\\.x/[a-z][a-z0-9-]*/svg")) {
                // Equivalent raster representation of the saved avatar. Preserve
                // seed, colors and every option byte-for-byte; do not render SVG.
                int queryAt = raw.indexOf('?');
                String query = queryAt < 0 ? "" : raw.substring(queryAt);
                return url.getScheme() + "://" + url.getRawAuthority() + path.substring(0, path.length()-3) + "png" + query;
            }
            return url.toASCIIString();
        } catch (Exception invalid) {
            return null;
        }
    }

    private static boolean validOrigin(URI origin) {
        if (origin.getHost() == null || origin.getRawUserInfo() != null || origin.getRawQuery() != null || origin.getRawFragment() != null
            || !(origin.getRawPath().isEmpty() || origin.getRawPath().equals("/"))) return false;
        String host = origin.getHost().toLowerCase(Locale.ROOT);
        boolean loopback = host.equals("127.0.0.1") || host.equals("localhost");
        // Cleartext is only for an explicitly configured local QA origin.
        if ("http".equals(origin.getScheme())) return loopback && origin.getPort() > 0;
        return "https".equals(origin.getScheme()) && !loopback && !host.contains(":") && !host.matches("[0-9.]+")
            && !host.endsWith(".localhost") && (origin.getPort() == -1 || origin.getPort() > 0);
    }

    private static boolean sameOrigin(URI a, URI b) {
        return a.getScheme().equals(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && port(a) == port(b);
    }
    private static int port(URI value) {
        return value.getPort() == -1 ? ("https".equals(value.getScheme()) ? 443 : 80) : value.getPort();
    }
    private static boolean forbiddenCharacters(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c <= 32 || c == 127 || c == '\\') return true;
        }
        return false;
    }
    private static boolean safePath(String path) {
        if (path == null || path.isEmpty() || !path.startsWith("/")) return false;
        // Encoded separators/control/dot/percent sequences have no legitimate
        // role in the supported avatar paths. Reject instead of normalizing.
        if (path.toLowerCase(Locale.ROOT).matches(".*%(?:00|0a|0d|2e|2f|5c|25).*")) return false;
        for (String piece : path.split("/")) if (piece.equals(".") || piece.equals("..")) return false;
        return true;
    }

    static String initials(String name) {
        if (name == null) return "?";
        String cleaned = name.replaceAll("[\\p{Cc}\\p{Cf}]", "").trim();
        String[] words = cleaned.split("[\\s\\p{Z}]+");
        if (cleaned.isEmpty() || words.length == 0) return "?";
        String first = new String(Character.toChars(words[0].codePointAt(0)));
        String last = words.length > 1 ? new String(Character.toChars(words[words.length-1].codePointAt(0))) : "";
        String upper = (first + last).toUpperCase(Locale.ROOT);
        int count = upper.codePointCount(0, upper.length());
        return count > 2 ? upper.substring(0, upper.offsetByCodePoints(0, 2)) : upper;
    }
}
