import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Exercise the real loopback fixture transport; never a provider or database.
test('rentals fixture exposes mapped, empty, denied, failed and scope-changed responses', async () => {
  const server = spawn('python3', ['-u', '-c', `
import importlib.util
from http.server import ThreadingHTTPServer
spec = importlib.util.spec_from_file_location('workspace_fixture', 'scripts/native-workspace-fixture.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.dashboard_fixture = None
server = ThreadingHTTPServer(('127.0.0.1', 0), m.Handler)
print(server.server_port, flush=True)
server.serve_forever()
`], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  let origin;
  const output = [];
  server.stderr.on('data', data => output.push(String(data)));
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture startup timed out')), 10000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${output.join('')}`)); });
      server.stdout.once('data', chunk => { clearTimeout(timer); resolve(Number(String(chunk).trim())); });
    });
    assert.ok(Number.isInteger(port) && port > 0);
    origin = `http://127.0.0.1:${port}`;
    const headers = { Cookie: 'next-auth.session-token=local-ui-fixture' };
    const get = () => fetch(origin + '/api/vendor/rentals/map', { headers });
    const control = async changes => {
      const response = await fetch(origin + '/__control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      assert.equal(response.status, 200);
    };
    assert.equal((await fetch(origin + '/api/vendor/rentals/map')).status, 401);
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const data = await response.json();
    assert.equal(data.version, 1);
    assert.deepEqual(data.scope, { userId: 12, vendorId: 29 });
    assert.equal(data.count, 5);
    assert.equal(data.orders.length, data.count);
    assert.equal(data.count + data.unmappedCount, data.totalRentalCount);
    assert.equal(new Set(data.orders.map(row => row.id)).size, data.count);
    for (const row of data.orders) {
      assert.ok(row.customerName.endsWith('(Fixture)'));
      assert.ok(Number.isFinite(row.lat) && Math.abs(row.lat) <= 90);
      assert.ok(Number.isFinite(row.lng) && Math.abs(row.lng) <= 180);
      assert.equal(row.href, '/vendor/rentals/' + row.id);
    }
    await control({ rentalsEmpty: true });
    const empty = await (await get()).json();
    assert.deepEqual(empty.orders, []);
    assert.equal(empty.totalRentalCount, 0);
    await control({ rentalsEmpty: false, rentalsError: 503 });
    assert.equal((await get()).status, 503);
    await control({ rentalsError: 0, rentalsPermission: false });
    assert.equal((await get()).status, 403);
    assert.equal((await (await fetch(origin + '/api/user/profile', { headers })).json()).user.vendorPermissions.rentals, false);
    await control({ rentalsPermission: true, rentalsLargeCount: 2400 });
    let cursor = null, snapshot = null, bytes = 0, pages = 0;
    const seen = new Set();
    do {
      const params = new URLSearchParams({ pageSize: '200' });
      if (cursor) params.set('cursor', cursor);
      const pageResponse = await fetch(origin + '/api/vendor/rentals/map?' + params, { headers });
      assert.equal(pageResponse.status, 200);
      const body = await pageResponse.text();
      const length = Buffer.byteLength(body);
      assert.ok(length <= 256 * 1024, 'Every fixture page fits the agreed transport envelope');
      bytes += length; pages++;
      const page = JSON.parse(body);
      assert.equal(page.version, 2);
      assert.equal(page.count, page.orders.length);
      assert.ok(page.count > 0 && page.count <= 200);
      assert.equal(page.mappedCount, 2400);
      assert.equal(page.totalRentalCount, page.mappedCount + page.unmappedCount);
      if (snapshot) assert.equal(page.snapshot, snapshot);
      snapshot = page.snapshot;
      for (const order of page.orders) { assert.ok(!seen.has(order.id)); seen.add(order.id); }
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.size, 2400);
    assert.ok(pages > 1 && bytes > 4 * 1024 * 1024, 'Aggregate exceeds both old per-response caps');
    console.log(`Verified ${pages} pages, ${seen.size} unique mapped rentals, ${bytes} aggregate wire bytes`);
    const first = await (await fetch(origin + '/api/vendor/rentals/map?pageSize=1', { headers })).json();
    await control({ rentalsLargeCount: 5 });
    const stale = await fetch(origin + '/api/vendor/rentals/map?pageSize=1&cursor=' + encodeURIComponent(first.nextCursor), { headers });
    assert.equal(stale.status, 409);
    await control({ rentalsLargeCount: 0, rentalsPermission: true, rentalsWrongScope: true });
    assert.equal((await (await get()).json()).scope.vendorId, 30);
    await control({ expired: true });
    assert.equal((await get()).status, 401);
  } finally {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
});
