import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../android/app/src/main/java/com/trashed/driver/', import.meta.url);
const source = name => readFileSync(new URL(name + '.java', root), 'utf8');
const activity = source('MainActivity');
const dock = source('NativeBottomNavigation');
const workspace = source('NativeWorkspaceView');

test('dashboard overlays only the weighted content slot, not the measured dock', () => {
  assert.match(dock, /container\.addView\(webView, new LinearLayout\.LayoutParams\(ViewGroup\.LayoutParams\.MATCH_PARENT, 0, 1\)\)/);
  assert.match(dock, /container\.addView\(bar, new LinearLayout\.LayoutParams\(ViewGroup\.LayoutParams\.MATCH_PARENT, ViewGroup\.LayoutParams\.WRAP_CONTENT\)\)/);
  assert.match(activity, /webParent\.addView\(chatContainer, webIndex, webParams\)/);
  assert.match(activity, /chatContainer\.addView\(nativeWorkspace, fullFrameParams\(\)\)/);
});
test('footer gets scrollable breathing room without duplicating dock or system insets', () => {
  assert.match(workspace, /if \("dashboard"\.equals\(destination\)\) body\.setPadding\(0, 0, 0, tokens\.dp\(24\)\)/);
  assert.match(workspace, /scroll\.addView\(body, tokens\.row\(\)\); addView\(scroll, new LinearLayout\.LayoutParams\(-1, 0, 1\)\)/);
  assert.match(activity, /Math\.max\(insets\.bottom, ime\.bottom\)/);
  assert.match(dock, /ViewCompat\.setOnApplyWindowInsetsListener\(bar, \(view, insets\) -> insets\)/);
});
test('native dashboard projects selection and restores underlying web selection on close', () => {
  assert.match(activity, /nativeNavigation\.dashboard\("dashboard"\.equals\(destination\)\)/);
  assert.match(activity, /private void closeNativeWorkspace\(\) \{\s*if \(nativeNavigation != null\) nativeNavigation\.dashboard\(false\)/);
  assert.match(dock, /if \(!nativeDashboardVisible\) return tab\.selected/);
  assert.match(dock, /if \(tab\.items\.isEmpty\(\)\) return "vendor-dashboard"\.equals\(tab\.id\)/);
  assert.match(dock, /for \(NativeNavigationState\.Item item : tab\.items\)\s*if \("vendor-dashboard"\.equals\(item\.id\)\) return true/);
  assert.match(dock, /boolean selected = nativeDashboardVisible \? "vendor-dashboard"\.equals\(item\.id\) : item\.selected/);
});
test('dock continues to enforce visibility, keyboard and offered-action guards', () => {
  assert.match(dock, /state != null && state\.visible && !state\.tabs\.isEmpty\(\) && !keyboardVisible && readiness\.allowed\(\)/);
  assert.match(activity, /document != navigationDocument \|\| !session\.equals\(workspaceSession\(\)\) \|\| !canPresentNavigation\(\)/);
  assert.match(activity, /!nativeNavigation\.accepts\(selection\)\) return/);
  assert.ok(activity.indexOf('if (openDirectWorkspace(selection)) return;') < activity.indexOf('listener.select(selection);'));
  assert.match(workspace, /playerStrip\.addView\(transport\); addView\(playerStrip, tokens\.row\(\)\)/);
});
