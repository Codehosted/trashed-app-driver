import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('loopback HTTP fixture starts without reverse DNS and serves a real request', () => {
  const result = spawnSync('python3', ['-u', '-c', `
import importlib.util, socket, threading, urllib.request
spec = importlib.util.spec_from_file_location('fixture', 'scripts/native-workspace-fixture.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def no_dns(*args):
    raise AssertionError('Loopback fixture must not depend on reverse DNS')
socket.getfqdn = no_dns
Server = getattr(m, 'LoopbackHTTPServer', m.ThreadingHTTPServer)
server = Server(('127.0.0.1', 0), m.Handler)
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    assert server.server_name == '127.0.0.1'
    assert server.server_port > 0
    with urllib.request.urlopen('http://127.0.0.1:%s/__health' % server.server_port, timeout=3) as response:
        assert response.status == 200
        assert b'"fixtureOnly": true' in response.read()
    print('PASS actual loopback request with reverse DNS forbidden')
finally:
    server.shutdown()
    server.server_close()
    worker.join(timeout=3)
    assert not worker.is_alive()
`], {cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000});
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.match(result.stdout, /PASS actual loopback request/);
});
