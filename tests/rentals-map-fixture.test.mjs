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
    await control({ rentalsPermission: true, rentalsWrongScope: true });
    assert.equal((await (await get()).json()).scope.vendorId, 30);
    await control({ expired: true });
    assert.equal((await get()).status, 401);
  } finally {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
});
