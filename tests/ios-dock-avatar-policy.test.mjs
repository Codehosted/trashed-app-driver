import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));

test('native dock saved-avatar URL and initials policy executes on Swift Foundation', {skip: process.platform !== 'darwin'}, () => {
  const dir = mkdtempSync(join(tmpdir(),'trashed-avatar-policy-'));
  try {
    writeFileSync(join(dir,'main.swift'), `
import Foundation
let origin = URL(string: "https://trashed.app")!
func check(_ condition: Bool, _ message: String) { if !condition { fatalError(message) } }
check(NativeDockAvatarPolicy.origin(fromConfiguredURL: URL(string:"https://trashed.app/app?source=trashed-app")!) == origin, "trusted Capacitor start URL becomes origin")
check(NativeDockAvatarPolicy.origin(fromConfiguredURL: URL(string:"http://127.0.0.1:3424/app?source=qa")!)?.absoluteString == "http://127.0.0.1:3424", "configured loopback origin")
check(NativeDockAvatarPolicy.origin(fromConfiguredURL: URL(string:"https://user:pass@trashed.app/app")!) == nil, "configured credentials rejected")
func image(_ raw: String?, _ source: URL = origin) -> String? { NativeDockAvatarPolicy.imageURL(raw, origin: source)?.absoluteString }
check(image("/uploads/avatar.png?v=2") == "https://trashed.app/uploads/avatar.png?v=2", "saved relative avatar")
check(image("https://trashed.app/user-image?id=12") == "https://trashed.app/user-image?id=12", "same-origin avatar")
let query = "seed=Jane%20Doe-3&backgroundColor=transparent&size=120&accessories=eyepatch%2Cwayfarers&accessoriesChance=30"
check(image("https://api.dicebear.com/7.x/avataaars/svg?"+query) == "https://api.dicebear.com/7.x/avataaars/png?"+query, "DiceBear preserves saved options")
for value in ["https://assets.public.blob.vercel-storage.com/photo.webp", "https://lh3.googleusercontent.com/a/photo=s96-c", "https://avatars.githubusercontent.com/u/12?v=4"] {
  check(image(value) == value, "supported saved source")
}
let local = URL(string:"http://127.0.0.1:3424")!
check(image("/avatar.png", local) == "http://127.0.0.1:3424/avatar.png", "explicit QA origin")
check(image("http://127.0.0.1:9999/avatar.png",local) == nil, "no other QA port")
let bad = ["", " ", " https://trashed.app/a.png", "https://trashed.app/a.png ", "//evil.example/a.png", "file:///tmp/a.png", "data:image/png;base64,AA", "https://user:pass@trashed.app/a.png", "https://trashed.app/a.png#x", "/a.png#x", "https://trashed.app.evil.example/a.png", "https://api.dicebear.com.evil.example/a.png", "https://public.blob.vercel-storage.com.evil.example/a.png", "https://evilgoogleusercontent.com/a.png", "https://evil.example/a.png", "https://127.0.0.1/a.png", "https://api.dicebear.com:8443/7.x/avataaars/svg?seed=x", "/../admin", "/a/../admin", "/a/./b", "/a/%2e%2e/admin", "/a/%252e%252e/admin", "/a%5cb.png", "/a%00b.png", "/bad%zz", "relative.png", "/a\\\\b.png", "/a\\nb.png"]
for value in bad { check(image(value) == nil, "must reject literal unsafe source: "+value) }
check(image(nil) == nil, "missing image")
check(image("/"+String(repeating:"a",count:2050)) == nil, "bounded URL")
for value in ["https://trashed.app/path", "https://trashed.app?x=1", "https://trashed.app#x", "https://user@trashed.app", "https://127.0.0.1", "http://trashed.app"] {
 check(image("https://api.dicebear.com/7.x/avataaars/svg?seed=x", URL(string:value)!) == nil, "invalid configured origin")
}
check(NativeDockAvatarPolicy.initials(" Jane   Doe ") == "JD", "initials")
check(NativeDockAvatarPolicy.initials("Ada Byron Lovelace") == "AL", "bounded initials")
check(NativeDockAvatarPolicy.initials("Élodie Öztürk") == "ÉÖ", "unicode initials")
check(NativeDockAvatarPolicy.initials("Jane\\u{00a0}Doe") == "JD", "unicode space")
check(NativeDockAvatarPolicy.initials(nil) == "?", "missing neutral fallback")
check(NativeDockAvatarPolicy.initials("\\u{200b} ") == "?", "invisible name")
print("PASS native avatar URL rejection, saved DiceBear equivalence, local QA boundary and initials")
`);
    const binary = join(dir,'policy');
    const build = spawnSync('xcrun',['swiftc',join(root,'ios/App/App/NativeDockAvatarPolicy.swift'),join(dir,'main.swift'),'-o',binary],{encoding:'utf8',timeout:60000});
    assert.equal(build.status,0,build.stderr);
    const run = spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout,/PASS native avatar URL/);
    console.log(run.stdout.trim());
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('bundled native Trisha artwork matches reviewed provenance', () => {
  const manifest=JSON.parse(readFileSync(join(root,'assets/brand/trisha-waving.json'),'utf8'));
  const gif=readFileSync(join(root,'ios/App/App/Brand/trisha-waving.gif'));
  assert.deepEqual(gif,readFileSync(join(root,'assets/brand/trisha-waving.gif')));
  assert.equal(gif.subarray(0,6).toString(),'GIF89a');
  assert.equal(gif.readUInt16LE(6),96); assert.equal(gif.readUInt16LE(8),96);
  assert.equal(gif.length,manifest.fileBytes);
  assert.equal(manifest.durationMs,10000); assert.equal(manifest.frames,67);
});
