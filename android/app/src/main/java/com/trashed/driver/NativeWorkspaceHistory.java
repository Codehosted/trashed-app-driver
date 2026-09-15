package com.trashed.driver;

import java.net.URI;

final class NativeWorkspaceHistory {
    private int floor = -1;
    private boolean awaitingWorkspace;

    void reset() { floor = -1; awaitingWorkspace = false; }
    void beginSession() { reset(); awaitingWorkspace = true; }

    void update(int index, boolean workspace, boolean committed) {
        if (awaitingWorkspace && workspace && committed && index >= 0) {
            floor = index;
            awaitingWorkspace = false;
        } else if (floor >= 0 && index < floor) reset();
    }

    boolean canGoBack(int index) { return floor >= 0 && index > floor; }

    static boolean isAuthenticationURL(String value) {
        try {
            String path = new URI(value).getPath();
            return "/app/login".equals(path) || "/partners/login".equals(path) || (path != null && path.startsWith("/api/auth/"));
        } catch (Exception ignored) { return false; }
    }

    static boolean isSameOriginURL(String value, String configured) {
        try {
            URI url = new URI(value), origin = new URI(configured);
            String scheme = origin.getScheme();
            if (!("https".equals(scheme) || "http".equals(scheme)) || !scheme.equals(url.getScheme())
                || origin.getHost() == null || url.getHost() == null
                || !origin.getHost().equalsIgnoreCase(url.getHost())
                || url.getRawUserInfo() != null || origin.getRawUserInfo() != null
                || port(url) != port(origin)) return false;
            String path = url.getPath();
            if (path == null || path.contains("\\")) return false;
            for (String part : path.split("/")) if (".".equals(part) || "..".equals(part)) return false;
            return true;
        } catch (Exception ignored) { return false; }
    }

    static boolean isWorkspaceURL(String value, String configured) {
        if (!isSameOriginURL(value, configured)) return false;
        try {
            String path = new URI(value).getPath();
            for (String prefix : new String[]{"/vendor", "/driver", "/calls", "/admin"}) {
                if (path.equals(prefix) || path.startsWith(prefix + "/")) return true;
            }
            return false;
        } catch (Exception ignored) { return false; }
    }

    private static int port(URI url) {
        return url.getPort() == -1 ? ("https".equals(url.getScheme()) ? 443 : 80) : url.getPort();
    }
}
