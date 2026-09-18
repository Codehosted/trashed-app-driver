import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(join(root, 'ios/App/App', name), 'utf8');

// Execute the production model/DTOs on macOS without building or installing the
// iOS app. Only audio playback is replaced; the request lifecycle is unchanged.
test('native rentals DTO, routes, authorization and lifecycle regressions', {
  skip: process.platform !== 'darwin', timeout: 90000,
}, () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-native-rentals-'));
  try {
    const api = read('NativeWorkspaceAPI.swift');
    const model = read('NativeWorkspaceModel.swift');
    const protocolStart = api.indexOf('@available');
    const protocolEnd = api.indexOf('// Refuse ALL redirects.');
    const modelStart = model.indexOf('@available', model.indexOf('final class WorkspaceAudio'));
    assert.ok(protocolStart >= 0 && protocolEnd > protocolStart, 'production protocol extraction boundaries');
    assert.ok(modelStart >= 0 && model.slice(modelStart).includes('final class WorkspaceModel'), 'production model extraction boundary');
    const method = signature => {
      const start = api.indexOf(`    func ${signature}`, api.indexOf('final class WorkspaceAPI:'));
      const end = api.indexOf('\n    }', start);
      assert.ok(start >= 0 && end > start, `production method boundary: ${signature}`);
      return api.slice(start, end + '\n    }'.length);
    };
    const endpoint = `
      @MainActor final class Endpoint {
        let origin = URL(string: "https://fixture.invalid")!
        var requestGeneration = UUID()
        var invalidated = false
        var actors = [fixtureProfile(), fixtureProfile()]
        var reads = 0
        var paths: [String] = []
        var response = snapshot()
        var failure: Error?
        var cancelOnRead = false
        var cancelOnReadNumber = 0
        var taskCancelOnReadNumber = 0
        var cancelOnProfileRead = 0
        var pageResponses: [Data] = []
        func profile() async throws -> WorkspaceProfile {
          let value = actors[min(reads, actors.count - 1)]; reads += 1
          if reads == cancelOnProfileRead { requestGeneration = UUID() }
          return value
        }
        func rentalsPageData(_ path: String) async throws -> Data {
          paths.append(path)
          if cancelOnRead || paths.count == cancelOnReadNumber { requestGeneration = UUID() }
          if paths.count == taskCancelOnReadNumber { withUnsafeCurrentTask { $0?.cancel() } }
          if let failure = failure { throw failure }
          if !pageResponses.isEmpty { return pageResponses.removeFirst() }
          return try legacyData(response)
        }
        ${method('validateScope(_ scope: String, calls: Bool = false)')}
        ${method('rentals(scope: String) async throws -> WorkspaceRentalsMap {')}
      }
    `;
    const harness = [
      'import Foundation', 'import SwiftUI',
      endpoint,
      api.slice(protocolStart, protocolEnd),
      '@MainActor final class WorkspaceAudio { func stop() {} }',
      model.slice(modelStart),
      readFileSync(join(root, 'tests/ios-native-rentals.swift'), 'utf8'),
      readFileSync(join(root, 'tests/ios-native-rentals-pagination.swift'), 'utf8'),
    ].join('\n');
    const source = join(directory, 'Harness.swift');
    const executable = join(directory, 'rentals-regressions');
    writeFileSync(source, harness);
    const compiled = spawnSync('xcrun', [
      'swiftc', '-parse-as-library', join(root, 'ios/App/App/NativeWorkspacePolicy.swift'),
      source, '-o', executable,
    ], {encoding: 'utf8', timeout: 60000});
    assert.equal(compiled.status, 0, compiled.error?.message ?? compiled.stderr);
    const result = spawnSync(executable, [], {encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /PASS rentals DTO/);
    assert.match(result.stdout, /PASS rentals endpoint/);
    assert.match(result.stdout, /PASS rentals model/);
    console.log(result.stdout.trim());
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('rentals uses native MapKit, adaptive safe-area layout and explicit web actions', () => {
  const view = read('NativeRentalsMapView.swift');
  const workspace = read('NativeWorkspaceView.swift');
  const project = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(view, /import MapKit/);
  assert.match(view, /RentalMapCanvas\(frame: \.zero\)/);
  assert.match(view, /class RentalMapCanvas: MKMapView/);
  assert.match(view, /bounds.size != lastSize/);
  assert.match(view, /VStack\(alignment: \.leading, spacing: 4\) \{ searchField; statusFilter \}/);
  assert.match(view, /map\.showsUserLocation = false/);
  assert.match(view, /class RentalDot: MKAnnotationView/);
  assert.match(view, /map\.setVisibleMapRect\(rect, edgePadding:/);
  assert.match(view, /UIAccessibility\.isReduceMotionEnabled/);
  assert.match(view, /@Environment\(\\\.colorScheme\)/);
  assert.match(view, /Color\(uiColor: \.systemBackground\)/);
  assert.match(view, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(view, /WorkspaceRentalMap[\s\S]*ScrollView \{\s*summary/);
  assert.doesNotMatch(view, /ignoresSafeArea|WKWebView|evaluateJavaScript|CLLocationManager|overrideUserInterfaceStyle/);
  assert.match(view, /Rental list · Web/);
  assert.match(view, /Rental details · Web/);
  assert.match(view, /await model\.openRentalsWeb\(path, open: openWeb\)/);
  assert.match(view, /if let size = rental\.dumpsterSize/);
  assert.match(view, /else if rental\.label != rental\.customerName/);
  assert.match(workspace, /case \.rentals:\s*WorkspaceRentalsMapView/);
  assert.match(project, /NativeRentalsMapView\.swift in Sources/);
});
