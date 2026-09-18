import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
test('real WorkspaceAPI loads >4 MiB rentals via bounded pages without relaxing HTTP limits', {
  skip: process.platform !== 'darwin', timeout: 120000,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-rentals-http-'));
  // Extend the shared fixture only in this process, recording actual response
  // bytes and adding an oversized-response fault; no shared fixture edits.
  const server = spawn('python3', ['-u', '-c', `
import importlib.util, json
spec = importlib.util.spec_from_file_location('fixture', 'scripts/native-workspace-fixture.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.dashboard_fixture = None
m.state['transportPages'] = []
m.state['oversize'] = False
class Handler(m.Handler):
    def do_GET(self):
        if self.path in ['/__oversize', '/__oversize-stream']:
            m.state['oversize'] = self.path
            return self.send(200, {})
        return super().do_GET()
    def send(self, status, body, content_type='application/json'):
        if self.path.startswith('/api/vendor/rentals/map') and status == 200:
            if m.state['oversize']:
                body = b' ' * (4 * 1024 * 1024 + 1)
                if m.state['oversize'] == '/__oversize-stream':
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(body)
                    return
            else:
                m.state['transportPages'].append({'bytes':len(json.dumps(body).encode()), 'count':body['count']})
        return super().send(status, body, content_type)
server = m.LoopbackHTTPServer(('127.0.0.1', 0), Handler)
print(server.server_port, flush=True)
server.serve_forever()
`], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let serverErrors = '';
  server.stderr.on('data', data => { serverErrors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Fixture startup timed out')), 10000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(Error(`Fixture exited ${code}: ${serverErrors}`)); });
      server.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    });
    assert.ok(Number.isInteger(port) && port > 0);
    const origin = `http://127.0.0.1:${port}`;
    const control = await fetch(origin + '/__control', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({rentalsLargeCount: 2400})});
    assert.equal(control.status, 200);
    writeFileSync(join(directory, 'Harness.swift'), `
import Foundation
import WebKit
import AppKit
@main struct Run {
    @MainActor static func main() async throws {
        _ = NSApplication.shared
        let origin = URL(string: "${origin}")!
        let data = WKWebsiteDataStore.nonPersistent()
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = data
        let web = WKWebView(frame: .zero, configuration: configuration)
        let store = data.httpCookieStore
        let cookie = HTTPCookie(properties: [.name: "next-auth.session-token", .value: "local-ui-fixture", .domain: "127.0.0.1", .path: "/"])!
        await withCheckedContinuation { done in store.setCookie(cookie) { done.resume() } }
        let api = WorkspaceAPI(origin: origin, cookieStore: store)
        let profile = try await api.profile()
        let result = try await api.rentals(scope: profile.scope(origin: origin))
        precondition(result.version == 1 && result.count == 2400)
        precondition(result.orders.count == 2400 && Set(result.orders.map(\\.id)).count == 2400)
        precondition(result.totalRentalCount == result.count + result.unmappedCount)
        _ = try result.validated(for: profile, origin: origin)
        print("PASS real WorkspaceAPI: 2400 unique rentals aggregated atomically")
        for mode in ["/__oversize", "/__oversize-stream"] {
            _ = try await URLSession.shared.data(from: URL(string: mode, relativeTo: origin)!)
            do {
                _ = try await api.rentals(scope: profile.scope(origin: origin))
                fatalError("HTTP limit was relaxed")
            } catch WorkspaceError.tooLarge {}
        }
        print("PASS real WorkspaceAPI: original 4 MiB per-request cap retained with/without Content-Length")
        api.close()
        withExtendedLifetime(web) {}
    }
}
`);
    const executable = join(directory, 'run');
    const build = spawnSync('xcrun', ['swiftc', '-parse-as-library', join(root, 'ios/App/App/NativeWorkspacePolicy.swift'), join(root, 'ios/App/App/NativeWorkspaceAPI.swift'), join(directory, 'Harness.swift'), '-o', executable], {encoding: 'utf8', timeout: 60000});
    assert.equal(build.status, 0, build.error?.message ?? build.stderr);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(executable); let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      const timer = setTimeout(() => { child.kill(); reject(Error('Native HTTP timed out: ' + stderr)); }, 60000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve({code, stdout, stderr}); });
    });
    assert.equal(result.code, 0, result.stdout + result.stderr + serverErrors);
    assert.match(result.stdout, /PASS real WorkspaceAPI: original 4 MiB/);
    const state = await (await fetch(origin + '/__state')).json();
    const pages = state.transportPages;
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.bytes <= 256 * 1024 && page.count > 0 && page.count <= 200));
    const bytes = pages.reduce((sum, page) => sum + page.bytes, 0);
    assert.ok(bytes > 4 * 1024 * 1024);
    assert.equal(pages.reduce((sum, page) => sum + page.count, 0), 2400);
    assert.ok(state.requests.filter(r => r.path.startsWith('/api/')).every(r => r.authenticated));
    assert.equal(state.requests.filter(r => r.path.startsWith('/api/vendor/rentals/map')).length, pages.length + 2);
    console.log(result.stdout.trim());
    console.log(JSON.stringify({realWorkspaceAPI: true, realWebKitCookies: true, pages: pages.length, aggregateBytes: bytes, mappedCount: 2400}));
  } finally {
    const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited;
    rmSync(directory, {recursive: true, force: true});
  }
});
