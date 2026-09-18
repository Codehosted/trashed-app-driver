package com.trashed.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Blocking transport, called only on the workspace executor. Never follows redirects. */
final class NativeWorkspaceApi {
    static final class EmailChanged extends IOException {
        EmailChanged() { super("Email saved. Sign in again with your new address."); }
    }
    static final class Failure extends IOException {
        final int status;
        Failure(int status, String message) { super(message); this.status = status; }
    }
    static final class Profile {
        final long id, vendorId;
        final String name, email, phone, business, roles, permissions, image;
        final boolean calls, emailVerified;
        Profile(JSONObject response) throws Exception {
            JSONObject user = response.getJSONObject("user");
            id = integer(user, "id", 1);
            name = text(user, "name"); email = user.getString("email"); phone = text(user, "phone");
            image = text(user, "image");
            JSONObject vendor = user.optJSONObject("vendor");
            vendorId = vendor == null ? 0 : integer(vendor, "id", 1); business = vendor == null ? "" : text(vendor, "businessName");
            JSONArray values = user.optJSONArray("roles"); List<String> labels = new ArrayList<>();
            if (values != null) for (int i = 0; i < values.length(); i++) labels.add(values.getString(i));
            Collections.sort(labels); roles = String.join(", ", labels);
            JSONObject permissionValues = user.optJSONObject("vendorPermissions");
            SortedMap<String, Boolean> permissionMap = new TreeMap<>();
            if (permissionValues != null) {
                Iterator<String> keys = permissionValues.keys();
                while (keys.hasNext()) { String key = keys.next(); Object value = permissionValues.get(key); if (!(value instanceof Boolean)) throw new IOException("Invalid profile permissions"); permissionMap.put(key, (Boolean)value); }
            }
            permissions = permissionMap.toString();
            JSONObject capabilities = response.getJSONObject("capabilities"); calls = capabilities.getBoolean("calls");
            emailVerified = user.optBoolean("emailVerified", false);
        }
        String scope() { return id + ":" + vendorId + ":" + roles + ":" + permissions + ":" + calls; }
    }
    static final class Call {
        final String id, name, phone, status, timestamp, transcript, recording, duration;
        final int satisfaction;
        Call(JSONObject value) throws Exception {
            id = value.getString("id"); if (id.isEmpty()) throw new IOException("Invalid call identity");
            name = text(value, "customerName"); phone = text(value, "customerPhone"); status = text(value, "status");
            timestamp = text(value, "timestamp"); transcript = text(value, "transcript");
            recording = value.optBoolean("hasRecording") ? text(value, "recordingUrl") : "";
            duration = value.optString("durationFormatted", NativeWorkspacePolicy.duration(value.optInt("duration")));
            satisfaction = value.optInt("customerSatisfaction", 0);
        }
        @Override public boolean equals(Object value) {
            if (!(value instanceof Call)) return false;
            Call other = (Call)value;
            return id.equals(other.id) && name.equals(other.name) && phone.equals(other.phone)
                && status.equals(other.status) && timestamp.equals(other.timestamp) && transcript.equals(other.transcript)
                && recording.equals(other.recording) && duration.equals(other.duration) && satisfaction == other.satisfaction;
        }
        @Override public int hashCode() { return Objects.hash(id,name,phone,status,timestamp,transcript,recording,duration,satisfaction); }
    }
    static final class Page {
        final List<Call> calls = new ArrayList<>();
        final int total, pages, page;
        Page(JSONObject json, int requested) throws Exception {
            total = (int)integer(json,"totalCalls",0); pages = (int)integer(json,"totalPages",0); page = (int)integer(json,"currentPage",1);
            if (total < 0 || pages < 0 || page != requested) throw new IOException("Invalid pagination response");
            JSONArray rows = json.getJSONArray("calls");
            if (rows.length() > 10) throw new IOException("Unexpected page size");
            for (int i = 0; i < rows.length(); i++) calls.add(new Call(rows.getJSONObject(i)));
        }
    }
    interface CookieSource {
        String get(String url);
        default void receive(String url, List<String> values) { }
    }
    interface ConnectionFactory { HttpURLConnection open(URL url) throws IOException; }
    final String origin;
    private final CookieSource cookies;
    private final ConnectionFactory connections;
    private final String identity;
    private final Set<HttpURLConnection> active = Collections.synchronizedSet(new HashSet<>());
    private volatile boolean cancelled;
    NativeWorkspaceApi(String origin, String cookie) { this(origin, url -> cookie == null ? "" : cookie); }
    NativeWorkspaceApi(String origin, CookieSource cookies) { this(origin, cookies, url -> (HttpURLConnection)url.openConnection()); }
    NativeWorkspaceApi(String origin, CookieSource cookies, ConnectionFactory connections) {
        this.origin = origin; this.cookies = cookies; this.connections = connections;
        identity = NativeWorkspacePolicy.identityFingerprint(cookies.get(origin));
    }
    private void checkIdentity() throws Failure {
        if (identity.isEmpty() || !identity.equals(NativeWorkspacePolicy.identityFingerprint(cookies.get(origin))))
            throw new Failure(401,"Your session or workspace changed. Reopen this screen.");
    }
    private void checkCancelled() throws IOException {
        if (cancelled || Thread.currentThread().isInterrupted()) throw new IOException("Cancelled");
    }
    private void checkCurrent() throws IOException {
        checkCancelled();
        checkIdentity();
        // A cookie-source callback can cancel while the live identity is read.
        checkCancelled();
    }
    void cancel() { cancelled = true; synchronized (active) { for (HttpURLConnection c : active) c.disconnect(); active.clear(); } }
    NativeDashboard dashboard() throws Exception { return new NativeDashboard(json("GET", "/api/mobile/dashboard", null)); }
    NativeRentalsMap rentalsMap() throws Exception {
        String path = "/api/vendor/rentals/map?pageSize=200";
        NativeRentalsMap first = null;
        List<NativeRentalsMap.Order> orders = new ArrayList<>();
        Set<String> ids = new HashSet<>(), cursors = new HashSet<>();
        // Same explicit aggregate envelope as iOS. Fail with the web escape,
        // never truncate or let bounded pages accumulate without a memory budget.
        long[] remainingBytes = {32L * 1024 * 1024};
        while (true) {
            checkCurrent();
            JSONObject value = json("GET", path, null, remainingBytes);
            // Legacy fixtures/servers may return v1, but never in a v2 chain.
            if (first == null && value.optInt("version") == 1) {
                NativeRentalsMap legacy = new NativeRentalsMap(value);
                checkCurrent(); return legacy;
            }
            NativeRentalsMap page = new NativeRentalsMap(value, true);
            if (first == null) first = page;
            else {
                page.requireSameScope(first);
                if (!first.snapshot.equals(page.snapshot) || first.mappedCount != page.mappedCount
                    || first.totalRentalCount != page.totalRentalCount || first.unmappedCount != page.unmappedCount)
                    throw new IOException("Rentals map changed. Please retry.");
            }
            for (NativeRentalsMap.Order order : page.orders) {
                if (!ids.add(order.id)) throw new IOException("Duplicate rental across map pages");
                orders.add(order);
            }
            if (orders.size() > first.mappedCount) throw new IOException("Invalid rentals map totals");
            checkCurrent();
            if (page.nextCursor == null) {
                if (orders.size() != first.mappedCount) throw new IOException("Incomplete rentals map response");
                NativeRentalsMap result = new NativeRentalsMap(first, orders);
                checkCurrent(); return result;
            }
            if (page.count == 0 || orders.size() >= first.mappedCount || !cursors.add(page.nextCursor))
                throw new IOException("Rentals map pagination made no progress");
            path = "/api/vendor/rentals/map?pageSize=200&cursor=" + URLEncoder.encode(page.nextCursor, "UTF-8");
        }
    }
    static boolean rentalsMapPath(String path) {
        if (path.equals("/api/vendor/rentals/map?pageSize=200")) return true;
        String prefix = "/api/vendor/rentals/map?pageSize=200&cursor=";
        return path.startsWith(prefix) && NativeRentalsMap.validCursor(path.substring(prefix.length()));
    }
    Profile profile() throws Exception { return new Profile(json("GET", "/api/user/profile", null)); }
    Profile save(Profile previous, String name, String email, String phone) throws Exception {
        Profile verified = profile();
        if (!verified.scope().equals(previous.scope())) throw new Failure(401, "Your workspace changed. Reopen your profile.");
        JSONObject body = new JSONObject().put("name", name).put("email", email).put("phone", phone);
        JSONObject result = json("PATCH", "/api/user/profile", body);
        if (!Boolean.TRUE.equals(result.opt("success"))) throw new IOException("The server did not confirm the update.");
        JSONObject stored = result.getJSONObject("user");
        if (integer(stored,"id",1) != previous.id) throw new Failure(401,"Your workspace changed.");
        if (Boolean.TRUE.equals(result.opt("reauthenticationRequired"))) throw new EmailChanged();
        Profile saved = profile(); // No optimistic success, and never queue offline writes.
        if (saved.id != previous.id || saved.vendorId != previous.vendorId) throw new Failure(401, "Your workspace changed.");
        if (!saved.name.equals(text(stored,"name")) || !saved.email.equals(text(stored,"email")) || !saved.phone.equals(text(stored,"phone")))
            throw new IOException("Update could not be verified. Refresh before retrying.");
        return saved;
    }
    Page calls(Profile expected, int page, String search, String filter, String sort) throws Exception {
        if (!expected.calls) throw new Failure(403, "Call history is not available for your role.");
        requireScope(expected, profile());
        Page result = new Page(json("GET", NativeWorkspacePolicy.callsPath(page, search, filter, sort), null), page);
        requireScope(expected, profile());
        return result;
    }
    private void requireScope(Profile expected, Profile current) throws Failure {
        if (!expected.scope().equals(current.scope())) throw new Failure(401, "Your account or workspace changed. Reopen this screen.");
    }
    private JSONObject json(String method, String path, JSONObject body) throws Exception {
        return json(method, path, body, null);
    }
    private JSONObject json(String method, String path, JSONObject body, long[] remainingBytes) throws Exception {
        if (!(path.equals("/api/user/profile") || (method.equals("GET") && (path.equals("/api/mobile/dashboard") || rentalsMapPath(path) || path.startsWith("/api/ai-features/calls?"))))) throw new IOException("Unsupported API route");
        URL url = new URL(origin + path);
        if (!NativeWorkspaceHistory.isSameOriginURL(url.toString(), origin)) throw new IOException("Untrusted API origin");
        HttpURLConnection connection = connection(url, method, true);
        try {
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            check(connection);
            if (!"application/json".equals(mime(connection))) throw new IOException("The server did not return JSON.");
            JSONObject result;
            try (InputStream input = connection.getInputStream()) {
                byte[] payload = bytes(input, 2 * 1024 * 1024);
                if (remainingBytes != null) {
                    if (payload.length > remainingBytes[0]) throw new IOException("Rental map exceeds the app memory limit. Open Rental list · Web.");
                    remainingBytes[0] -= payload.length;
                }
                result = new JSONObject(new String(payload, StandardCharsets.UTF_8));
                if (rentalsMapPath(path) && result.optInt("version") == 2 && payload.length > 256 * 1024)
                    throw new IOException("Rentals map page exceeds the 256 KiB limit");
            }
            checkCurrent(); return result;
        } finally { active.remove(connection); connection.disconnect(); }
    }
    File recording(File cache, String value) throws Exception {
        URI uri = NativeWorkspacePolicy.recording(origin, value);
        boolean same = NativeWorkspaceHistory.isSameOriginURL(uri.toString(), origin);
        HttpURLConnection connection = connection(uri.toURL(), "GET", same);
        File file = null;
        try {
            check(connection);
            String type = mime(connection);
            if (!Arrays.asList("audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/wave").contains(type)) throw new IOException("The recording is not audio.");
            file = File.createTempFile("workspace-recording-", ".audio", cache);
            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(file)) {
                byte[] buffer = new byte[8192]; int size, total = 0;
                while ((size = input.read(buffer)) != -1) {
                    total += size; checkCancelled();
                    if (total > 32 * 1024 * 1024) throw new IOException("Recording exceeds the 32 MB playback limit.");
                    output.write(buffer, 0, size);
                }
            }
            checkCurrent();
            if (file.length() == 0) throw new IOException("The recording is empty.");
            return file;
        } catch (Exception error) { if (file != null) file.delete(); throw error; }
        finally { active.remove(connection); connection.disconnect(); }
    }
    private HttpURLConnection connection(URL url, String method, boolean authenticated) throws Exception {
        checkCurrent();
        String requestCookies = authenticated ? Objects.toString(cookies.get(url.toString()), "") : "";
        if (authenticated && !identity.equals(NativeWorkspacePolicy.identityFingerprint(requestCookies)))
            throw new Failure(401,"Your session changed before this request. Reopen the screen.");
        HttpURLConnection connection = connections.open(url);
        connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
        connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json, audio/*"); connection.setRequestProperty("Cache-Control", "no-store");
        // Explicit headers; never install CookieHandler globally and never pass a URL to MediaPlayer.
        connection.setRequestProperty("Cookie", requestCookies);
        if (authenticated) connection.setRequestProperty("Origin", origin);
        active.add(connection);
        try { checkCancelled(); }
        catch (IOException error) { active.remove(connection); connection.disconnect(); throw error; }
        return connection;
    }
    private void check(HttpURLConnection connection) throws Exception {
        int code = connection.getResponseCode();
        checkCancelled();
        // Data transport is a read-only cookie consumer, including PATCH, audio,
        // and error responses. Only login/session owners may update the OS jar:
        // a delayed old-account Set-Cookie must never replace the current login.
        if (code >= 300 && code < 400) throw new Failure(code, "The server redirected this request. Sign in again or retry.");
        if (code == 401) throw new Failure(code, "Your session expired. Sign in again.");
        if (code == 403) throw new Failure(code, "Your role or plan does not allow this feature.");
        if (code == 404 && connection.getURL().getPath().endsWith("/recording")) throw new Failure(code,"This recording is not ready or is no longer available. Try again shortly.");
        if (code == 410) throw new Failure(code,"This legacy recording is no longer available.");
        if (code == 409 && connection.getURL().getPath().equals("/api/vendor/rentals/map"))
            throw new Failure(code,"Rentals map changed. Please retry.");
        if (code < 200 || code >= 300) throw new Failure(code, code == 409 ? "That email is already in use." : "Request failed (" + code + "). Please retry.");
        checkCurrent();
    }
    private byte[] bytes(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int read;
        while ((read = input.read(buffer)) != -1) { checkCancelled(); if (out.size() + read > limit) throw new IOException("Response unavailable or too large"); out.write(buffer, 0, read); }
        checkCancelled(); // Also covers zero-byte bodies and cancellation at EOF.
        return out.toByteArray();
    }
    private static String mime(HttpURLConnection connection) { return Objects.toString(connection.getContentType(),"").split(";",2)[0].trim().toLowerCase(Locale.ROOT); }
    private static long integer(JSONObject json,String key,long min) throws Exception {
        Object value=json.get(key);
        if (!(value instanceof Number)) throw new IOException("Invalid numeric field");
        double number=((Number)value).doubleValue();
        if (Double.isNaN(number) || Double.isInfinite(number) || number < min || number > Integer.MAX_VALUE || number != Math.floor(number)) throw new IOException("Invalid numeric field");
        return ((Number)value).longValue();
    }
    private static String text(JSONObject json, String key) throws IOException {
        Object value=json.opt(key);
        if (value==null || value==JSONObject.NULL) return "";
        if (!(value instanceof String)) throw new IOException("Invalid text field");
        return (String)value;
    }
}
