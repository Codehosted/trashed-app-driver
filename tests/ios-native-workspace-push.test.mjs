import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args); let text = '';
    child.stdout.on('data', data => text += data);
    child.stderr.on('data', data => text += data);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(text) : reject(new Error(text)));
  });
}

test('production Swift push policy and HTTP transport reject unsafe state', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-push-'));
  const requests = [];
  const profile = { user: { id: 17, email: 'fixture@example.invalid', roles: ['vendor'], vendor: { id: 4, businessName: 'Fixture' } }, capabilities: { calls: true } };
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, headers: req.headers, body });
    if (req.url === '/api/vendor/push-receipt') {
      res.writeHead(302, { Location: '/forbidden-target' }); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'ambient=injected; Path=/' });
    res.end(JSON.stringify(req.url === '/api/user/profile' ? profile : { ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await writeFile(join(dir, 'main.swift'), `
import Foundation
@main struct Harness {
 static func main() async throws {
  let origin = URL(string: "http://127.0.0.1:${port}")!
  precondition(WorkspacePushPolicy.token(Data([0, 1, 255])) == "0001ff")
  precondition(WorkspacePushPolicy.token(Data()) == nil)
  for bad in ["https://evil.invalid/vendor/dashboard", "//evil.invalid/vendor/dashboard", "/vendor/profile/delete", "/api/auth/signout", "/vendor/%64ashboard", "/vendor/dashboard#logout"] {
   precondition(WorkspacePushPolicy.destination(bad, origin: origin) == nil)
  }
  precondition(WorkspacePushPolicy.destination("/vendor/profile?view=delete-account", origin: origin)?.query == nil)
  let cookie = HTTPCookie(properties: [.domain: "127.0.0.1", .path: "/", .name: "authjs.session-token", .value: "fixture-only"])!
  HTTPCookieStorage.shared.setCookie(HTTPCookie(properties: [.domain: "127.0.0.1", .path: "/", .name: "ambient", .value: "must-not-leak"])!)
  let transport = WorkspacePushTransport(origin: origin, cookies: [cookie])
  defer { transport.close() }
  let p = try JSONDecoder().decode(WorkspaceProfile.self, from: await transport.request("/api/user/profile"))
  try await transport.verify(p.scope(origin: origin))
  do { try await transport.verify("different-account"); fatalError("scope accepted") } catch WorkspaceError.scopeChanged { }
  try await transport.acknowledged("/api/vendor/push-token", method: "POST", body: WorkspacePushPolicy.registrationBody("fixture-token"))
  try await transport.acknowledged("/api/driver/push-token", method: "DELETE", body: WorkspacePushPolicy.revokeBody("fixture-token"))
  // A legacy/partial server ACK cannot authorize fenced native registration/logout.
  do { try await transport.acknowledged("/api/driver/push-token", method: "DELETE", body: WorkspacePushPolicy.revokeBody("fixture-token",registrationId:"11111111-1111-4111-8111-111111111111"), requireFence:true); fatalError("unfenced acknowledgement accepted") } catch WorkspaceError.invalidResponse { }
  do { _ = try await transport.request("/api/vendor/push-receipt", method: "POST", body: Data("{}".utf8)); fatalError("redirect accepted") } catch WorkspaceError.invalidResponse { }
  do { _ = try await transport.request("/api/auth/signout"); fatalError("unlisted path accepted") } catch WorkspaceError.unsafeURL { }
  print("PASS real Foundation transport and push policy")
 }
}
`);
    const root = resolve('ios/App/App');
    await run('xcrun', ['swiftc', '-parse-as-library', join(root, 'NativeWorkspacePolicy.swift'), join(root, 'NativeWorkspacePush.swift'), join(dir, 'main.swift'), '-o', join(dir, 'harness')]);
    assert.match(await run(join(dir, 'harness'), []), /PASS real Foundation/);
    assert.equal(requests.length, 7);
    assert.ok(requests.every(r => r.headers.cookie === 'authjs.session-token=fixture-only'));
    assert.ok(requests.every(r => r.path !== '/forbidden-target'));
    const registration = requests.find(r => r.method === 'POST' && r.path.endsWith('push-token'));
    assert.deepEqual(JSON.parse(registration.body), { token: 'fixture-token', platform: 'ios', appId: 'com.trashed.driver' });
    const revoke = requests.find(r => r.method === 'DELETE');
    assert.deepEqual(JSON.parse(revoke.body), { token: 'fixture-token', allAudiences: true });
    assert.equal(registration.headers.origin, `http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('native lifecycle safety contracts remain wired', async () => {
  const source = await readFile('ios/App/App/NativeWorkspacePush.swift', 'utf8');
  assert.match(source, /capacitorDidRegisterForRemoteNotifications/);
  assert.match(source, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(source, /await registration\?\.value/);
  assert.match(source, /allowPermissionPrompt: Bool = false/);
  assert.match(source, /center\.delegate = downstream/);
  assert.match(source, /removeAllDeliveredNotifications/);
  assert.match(source, /requireFence: true/);
  assert.match(source, /result\["matched"\] as\? Bool == true/);
  assert.match(source, /jsName = "TrashedWorkspacePush"/);
  const stop = source.slice(source.indexOf('func stop()'), source.indexOf('func cookiesDidChange'));
  assert.doesNotMatch(stop, /method: "DELETE"|unregisterForRemoteNotifications\(/);
  assert.doesNotMatch(source, /print\(|NSLog\(/);
});
