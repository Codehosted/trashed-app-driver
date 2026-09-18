import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ios/App/App/NativeChatView.swift',import.meta.url),'utf8');
test('measured colors preserve matching web CSS and adapt only stale OS-mode payloads',()=>{
 const measured=readFileSync(new URL('../ios/App/App/NativeChatMeasured.swift',import.meta.url),'utf8');
 assert.match(measured,/projectedAppearance = state\.appearance/);
 assert.match(measured,/current == appearance \? exact : fallback\.resolvedColor/);
});
test('measured native chat fills its viewport from projected web surface',()=>{
 assert.match(source,/state\.screen\?\.toolbar\.first\?\.style\?\.background/);
 assert.match(source,/NativeChatPalette\.color\(source, role: \.background\)/);
 assert.match(source,/\.background\(measuredBackground\)/);
});
test('native overlay dismissal dispatches only the existing offered Escape action',()=>{
 assert.match(source,/if state\.offers\("screen-dismiss"\)/);
 assert.match(source,/onAction\("screen-dismiss", nil\)/);
 assert.match(source,/accessibilityIdentifier\("trashed-native-overlay-dismiss"\)/);
 assert.match(source,/accessibilityAction\(\.escape\)/);
 assert.doesNotMatch(source,/evaluateJavaScript|location\.href/);
});
