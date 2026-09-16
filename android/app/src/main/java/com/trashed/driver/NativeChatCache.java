package com.trashed.driver;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;

/** One authenticated scope at a time, AES-GCM under AndroidKeyStore, never included in backup. */
final class NativeChatCache {
    static final long TTL_MS = 30 * 60 * 1000L;
    private static final String KEY = "trashed-native-chat-v1";
    private final File directory;
    private String confirmed;
    private String session = "";
    NativeChatCache(Context context) { directory = new File(context.getNoBackupFilesDir(), "native-chat-v1"); }
    synchronized void confirm(String origin, String scope, String authenticatedSession) {
        String next = digest(origin + "\n" + authenticatedSession + "\n" + scope);
        if (confirmed != null && !confirmed.equals(next)) purge();
        session = authenticatedSession;
        confirmed = next;
        directory.mkdirs();
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) if (!file.getName().equals(next + ".bin")) file.delete();
    }
    synchronized JSONObject read(String origin, String scope, long now) {
        String name = digest(origin + "\n" + session + "\n" + scope);
        if (!name.equals(confirmed)) return null; // Never hydrate using unverified JS-provided scope alone.
        File file = new File(directory, name + ".bin");
        if (!file.isFile()) return null;
        try {
            if (file.length() < 29 || file.length() > NativeChatState.MAX_BYTES + 8192) throw new IOException();
            byte[] encrypted = readBounded(new FileInputStream(file), NativeChatState.MAX_BYTES + 8192);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, encrypted, 0, 12));
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            JSONObject envelope = new JSONObject(new String(cipher.doFinal(encrypted, 12, encrypted.length - 12), StandardCharsets.UTF_8));
            long age = now - envelope.getLong("savedAt");
            if (age < 0 || age > TTL_MS || !scope.equals(envelope.getString("scopeKey"))) throw new IOException();
            JSONObject state = envelope.getJSONObject("state"); new NativeChatState(state, origin); return state;
        } catch (Exception ignored) { file.delete(); return null; }
    }
    synchronized void write(String origin, NativeChatState state, long now) {
        String name = digest(origin + "\n" + session + "\n" + state.scopeKey);
        if (!name.equals(confirmed)) return;
        File temporary = new File(directory, name + ".tmp");
        try {
            JSONObject envelope = new JSONObject().put("savedAt", now).put("scopeKey", state.scopeKey).put("state", state.json);
            byte[] plain = envelope.toString().getBytes(StandardCharsets.UTF_8);
            if (plain.length > NativeChatState.MAX_BYTES + 4096) return;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(cipher.getIV()); stream.write(cipher.doFinal(plain)); stream.getFD().sync(); }
            if (!temporary.renameTo(new File(directory, name + ".bin"))) temporary.delete();
        } catch (Exception ignored) { temporary.delete(); } // Cache failure never breaks live chat.
    }
    synchronized void purge() {
        confirmed = null;
        File[] files = directory.listFiles(); if (files != null) for (File file : files) file.delete();
    }
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static byte[] readBounded(InputStream input, int max) throws IOException {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) { if (output.size() + count > max) throw new IOException("Response too large"); output.write(buffer, 0, count); }
            return output.toByteArray();
        }
    }
    static String digest(String value) {
        try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b)); return out.toString(); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
}
