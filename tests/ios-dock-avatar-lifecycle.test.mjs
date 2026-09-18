import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file = name => readFileSync(new URL('../ios/App/App/'+name, import.meta.url),'utf8');

test('UIKit-hosted SwiftUI avatar lifecycle follows UIApplication notifications', () => {
  const source=file('NativeDockAvatar.swift');
  const start=source.indexOf('struct NativeDockAccountView: View');
  const end=source.indexOf('private final class NativeTrishaImageView');
  assert.ok(start>=0 && end>start);
  const account=source.slice(start,end);
  assert.doesNotMatch(account, /@Environment\(\\\.scenePhase\)/);
  assert.match(account, /onAppear \{ active = UIApplication\.shared\.applicationState == \.active \}/);
  assert.match(account, /UIApplication\.didBecomeActiveNotification/);
  assert.match(account, /UIApplication\.willResignActiveNotification/);
  assert.match(account, /active = false; image = nil; loadedKey = nil/);
  assert.match(account, /\.task\(id: key\)/);
  assert.match(account, /!Task\.isCancelled/);
  assert.match(account, /loadedKey == key && enabled && active/);
});

test('native avatar image transport and bundle registration preserve security boundaries', () => {
  const source=file('NativeDockAvatar.swift');
  assert.match(source,/config\.httpCookieStorage = nil; config\.httpShouldSetCookies = false/);
  assert.match(source,/config\.urlCredentialStorage = nil; config\.urlCache = nil/);
  assert.match(source,/completionHandler\(nil\)/);
  assert.match(source,/data\.count < limit/);
  assert.match(source,/width \* height <= 16_000_000/);
  assert.match(source,/kCGImageSourceThumbnailMaxPixelSize: 128/);
  assert.match(source,/withRenderingMode\(\.alwaysOriginal\)/);
  const project=readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj',import.meta.url),'utf8');
  assert.match(project,/NativeDockAvatar\.swift in Sources/);
  assert.match(project,/NativeDockAvatarPolicy\.swift in Sources/);
  assert.match(project,/Brand in Resources/);
});
