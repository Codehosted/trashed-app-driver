package com.trashed.driver;

import java.util.Objects;

/** Native presentation lease; the source document never becomes the destination. */
final class NativeWorkspaceRoute {
    final String source, session, destination, url;
    final long document;
    private NativeWorkspaceRoute(String source, String session, String destination, String url, long document) {
        this.source = source; this.session = session; this.destination = destination; this.url = url; this.document = document;
    }
    static NativeWorkspaceRoute select(String id, String source, String origin, String session, long document) {
        String destination = NativeWorkspacePolicy.selection(id);
        if (destination.isEmpty() || session == null || session.isEmpty()
            || !NativeWorkspaceHistory.isWorkspaceURL(source, origin)) return null;
        return new NativeWorkspaceRoute(source, session, destination,
            origin + ("dashboard".equals(destination) ? "/vendor/dashboard" : "profile".equals(destination) ? "/vendor/profile" : "rentals".equals(destination) ? "/vendor/rentals" : "/calls/history"), document);
    }
    boolean valid(String source, String session, long document) {
        return this.document == document && Objects.equals(this.source, source)
            && !this.session.isEmpty() && this.session.equals(session);
    }
}
