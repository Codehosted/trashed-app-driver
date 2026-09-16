import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const read = name => readFileSync(root + 'ios/App/App/' + name, 'utf8');
test('Swift lifecycle: stale load/save/resume/close, cookie snapshot, named web fallback', { skip: process.platform !== 'darwin', timeout: 90000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ios-workspace-lifecycle-'));
  try {
    const api = read('NativeWorkspaceAPI.swift');
    const model = read('NativeWorkspaceModel.swift');
    const shell = read('MainViewController.swift');
    // Compile production model and pure security/routing decisions. Only AVPlayer is
    // replaced: the fake transport deliberately ignores cancellation to expose races.
    const definitions = api.slice(api.indexOf('@available'), api.indexOf('// Refuse ALL redirects.'));
    const routing = shell.slice(shell.indexOf('// Pure routing decision'), shell.indexOf('private enum DriverTheme'));
    const implementation = model.slice(model.indexOf('@available', model.indexOf('final class WorkspaceAudio')));
    writeFileSync(join(dir, 'Harness.swift'), 'import Foundation\nimport SwiftUI\n' + definitions + routing + '\n@MainActor final class WorkspaceAudio { func stop() {} }\n' + implementation + readFileSync(new URL('./ios-workspace-lifecycle.swift', import.meta.url), 'utf8'));
    const build = spawnSync('xcrun', ['swiftc', '-parse-as-library', root + 'ios/App/App/NativeWorkspacePolicy.swift', join(dir, 'Harness.swift'), '-o', join(dir, 'test')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(join(dir, 'test'), [], { encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /PASS 8 lifecycle scenarios/);
    console.log(run.stdout.trim());
    const dispatch = api.slice(api.indexOf('let snapshot = WorkspaceCookieSnapshot'), api.indexOf('let (bytes, response)'));
    assert.equal((dispatch.match(/await allCookies\(\)/g) || []).length, 1, 'only one outgoing cookie snapshot');
    assert.equal((dispatch.match(/\bawait\b/g) || []).length, 1, 'no suspension between snapshot validation and dispatch');
    assert.match(dispatch, /snapshot.headers\(for: url, previous: fingerprint\)/);
    assert.doesNotMatch(api, /getAllTasks/, 'late cancellation cannot cancel a new resume session');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
