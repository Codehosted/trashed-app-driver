package com.trashed.driver;

import java.net.URI;
import java.nio.charset.StandardCharsets;

final class TextExportPolicy {
    static final int MAX_BYTES = 5 * 1024 * 1024;

    static String validationError(String filename, String content) {
        if (filename == null || filename.length() > 120 || filename.contains("..")
            || !filename.matches("[A-Za-z0-9][A-Za-z0-9 ._-]*\\.txt")) return "INVALID_FILENAME";
        if (content == null) return "INVALID_CONTENT";
        if (content.length() > MAX_BYTES || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return "TOO_LARGE";
        return null;
    }

    static boolean isTrustedOrigin(String current, String configured) {
        if (current == null || configured == null) return false;
        try {
            URI actual = new URI(current), expected = new URI(configured);
            String scheme = expected.getScheme();
            return ("https".equals(scheme) || "http".equals(scheme))
                && scheme.equals(actual.getScheme()) && expected.getHost() != null
                && expected.getHost().equalsIgnoreCase(actual.getHost())
                && actual.getRawUserInfo() == null && expected.getRawUserInfo() == null
                && port(actual) == port(expected);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static int port(URI uri) {
        return uri.getPort() >= 0 ? uri.getPort() : "https".equals(uri.getScheme()) ? 443 : 80;
    }
}
