package com.trashed.driver;

import org.json.*;
import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.*;

/** Strict versioned rentals projection. No cookies, raw JSON or persistent private cache. */
final class NativeRentalsMap {
    static final String LIST_PATH = "/vendor/rentals?view=list";
    final long userId, vendorId;
    final int count, mappedCount, totalRentalCount, unmappedCount;
    final String generatedAt, snapshot, nextCursor;
    final List<Order> orders;
    static final class Order {
        final String id, label, status, source, address, customerName, confirmationCode, totalPrice,
            dumpsterSize, dumpsterDescription, href, deliveryDate, pickupDate;
        final double lat, lng;
        private final String searchText;
        Order(JSONObject value) throws Exception {
            id = text(value,"id",true,160);
            if (!id.matches("[A-Za-z0-9_:-]+")) throw invalid();
            label = text(value,"label",true,500); status = text(value,"status",true,80);
            source = text(value,"source",false,80); address = text(value,"address",false,2000);
            customerName = text(value,"customerName",false,500); confirmationCode = text(value,"confirmationCode",false,160);
            dumpsterSize = text(value,"dumpsterSize",false,160); dumpsterDescription = text(value,"dumpsterDescription",false,2000);
            deliveryDate = text(value,"deliveryDate",false,80); pickupDate = text(value,"pickupDate",false,80);
            Object price = value.opt("totalPrice");
            if (price instanceof Number) {
                if (!Double.isFinite(((Number)price).doubleValue())) throw invalid();
                totalPrice = price.toString();
            } else totalPrice = text(value,"totalPrice",false,160);
            href = text(value,"href",true,1024);
            if (!validHref(href)) throw invalid();
            lat = coordinate(value,"lat",90); lng = coordinate(value,"lng",180);
            searchText = String.join(" ", label,status,source,address,customerName,confirmationCode,dumpsterSize,dumpsterDescription).toLowerCase(Locale.ROOT);
        }
        boolean matches(String search, String filter) {
            return ("all".equals(filter) || status.equals(filter)) && searchText.contains(search.trim().toLowerCase(Locale.ROOT));
        }
    }
    NativeRentalsMap(JSONObject value) throws Exception {
        this(value, false);
    }
    NativeRentalsMap(JSONObject value, boolean paginated) throws Exception {
        if (integer(value,"version",1) != (paginated ? 2 : 1)) throw invalid();
        generatedAt = text(value,"generatedAt",true,80);
        try { Instant.parse(generatedAt); } catch (Exception error) { throw invalid(); }
        JSONObject scope = value.getJSONObject("scope");
        userId = integer(scope,"userId",1); vendorId = integer(scope,"vendorId",1);
        count = integer(value,"count",0); totalRentalCount = integer(value,"totalRentalCount",0); unmappedCount = integer(value,"unmappedCount",0);
        mappedCount = paginated ? integer(value,"mappedCount",0) : count;
        snapshot = paginated ? text(value,"snapshot",true,64) : "";
        nextCursor = paginated && value.get("nextCursor") != JSONObject.NULL ? text(value,"nextCursor",true,256) : null;
        if (paginated && (!snapshot.matches("[0-9a-f]{64}") || (nextCursor != null && !validCursor(nextCursor)))) throw invalid();
        JSONArray rows = value.getJSONArray("orders");
        if (count != rows.length() || (long)mappedCount + unmappedCount != totalRentalCount
            || count > mappedCount || (paginated && count > 200)) throw invalid();
        List<Order> parsed = new ArrayList<>(); Set<String> ids = new HashSet<>();
        for (int i = 0; i < rows.length(); i++) {
            Order order = new Order(rows.getJSONObject(i));
            if (!ids.add(order.id)) throw invalid();
            parsed.add(order);
        }
        orders = Collections.unmodifiableList(parsed);
    }
    NativeRentalsMap(NativeRentalsMap first, List<Order> complete) {
        userId=first.userId; vendorId=first.vendorId; generatedAt=first.generatedAt;
        count=complete.size(); mappedCount=first.mappedCount; totalRentalCount=first.totalRentalCount;
        unmappedCount=first.unmappedCount; snapshot=first.snapshot; nextCursor=null;
        orders=Collections.unmodifiableList(new ArrayList<>(complete));
    }
    static boolean validCursor(String cursor) {
        if (!cursor.matches("[A-Za-z0-9_-]{1,256}")) return false;
        // Canonical unpadded base64url has zero unused tail bits. Avoid the
        // API-26 java.util.Base64 dependency: this app also supports API 23.
        int remainder = cursor.length() % 4;
        int tail = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(cursor.charAt(cursor.length()-1));
        return remainder == 0 || (remainder == 2 && (tail & 15) == 0) || (remainder == 3 && (tail & 3) == 0);
    }
    List<Order> filtered(String search, String status) {
        List<Order> result = new ArrayList<>();
        for (Order order : orders) if (order.matches(search,status)) result.add(order);
        return result;
    }
    void requireSameScope(NativeRentalsMap previous) throws NativeWorkspaceApi.Failure {
        if (previous != null && (userId != previous.userId || vendorId != previous.vendorId))
            throw new NativeWorkspaceApi.Failure(401,"Your account or workspace changed. Reopen Rentals.");
    }
    static boolean validHref(String href) {
        try {
            URI uri = new URI(href);
            // Exact app-relative detail routes only; never normalize an unsafe path.
            if (uri.isAbsolute() || uri.getRawAuthority() != null || uri.getRawFragment() != null
                || !uri.getRawPath().matches("/vendor/rentals/[A-Za-z0-9_-]+")) return false;
            String query = uri.getRawQuery();
            return query == null || query.matches("source=[A-Za-z0-9_-]{1,80}");
        } catch (Exception ignored) { return false; }
    }
    private static int integer(JSONObject value, String key, int min) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof Number)) throw invalid();
        double n = ((Number)raw).doubleValue();
        if (!Double.isFinite(n) || n < min || n > Integer.MAX_VALUE || n != Math.floor(n)) throw invalid();
        return ((Number)raw).intValue();
    }
    private static double coordinate(JSONObject value, String key, double bound) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof Number)) throw invalid();
        double n = ((Number)raw).doubleValue();
        if (!Double.isFinite(n) || n < -bound || n > bound) throw invalid();
        return n;
    }
    private static String text(JSONObject value, String key, boolean required, int limit) throws Exception {
        Object raw = value.opt(key);
        if (!required && (raw == null || raw == JSONObject.NULL)) return "";
        if (!(raw instanceof String)) throw invalid();
        String text = (String)raw;
        if ((required && text.trim().isEmpty()) || text.length() > limit || text.indexOf('\0') >= 0) throw invalid();
        return text;
    }
    private static IOException invalid() { return new IOException("Invalid rentals map response"); }
}
