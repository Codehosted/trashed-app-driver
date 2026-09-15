import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const swift = read('ios/App/App/MainViewController.swift');
const login = swift.slice(swift.indexOf('private struct NativeDriverLoginView'), swift.indexOf('private struct DriverLoginMapBackground'));
const java = read('android/app/src/main/java/com/trashed/driver/MainActivity.java');
const android = java.slice(java.indexOf('private void showNativeLogin()'), java.indexOf('private void submitNativeLogin()'));

test('iOS custom login buttons explicitly suppress inherited chrome and match Apple geometry', () => {
  assert.match(login, /\.signInWithAppleButtonStyle\(isLightMode \? \.black : \.white\)\s*\.frame\(height: 50\)\s*\.cornerRadius\(14\)/);
  for (const [begin, end] of [['Button(action: submitGoogle)', 'if appleLinkPending'], ['Button(action: submit)', 'Text("Need access?']]) {
    const button = login.slice(login.indexOf(begin), login.indexOf(end, login.indexOf(begin)));
    assert.match(button, /\.buttonStyle\(\.plain\)/);
    assert.match(button, /\.frame\(maxWidth: \.infinity, minHeight: 50\)/);
    assert.match(button, /\.cornerRadius\(14\)/);
    assert.match(button, /\.font\(\.system\(size: 17, weight: \.medium\)\)/);
    assert.doesNotMatch(button, /\.shadow\(/);
  }
  assert.match(login, /RoundedRectangle\(cornerRadius: 14\)\.stroke\(dividerColor, lineWidth: 1\)/);
  assert.match(login, /\.background\(canSubmit \? primary : disabledButtonColor\)\s*\.foregroundColor\(canSubmit \? \.white : secondaryTextColor\)/);
  assert.doesNotMatch(login, /LinearGradient|cardShadowColor|green: 0\.74|blue: 0\.84\)/);
});

test('both login surfaces use shared benefit copy, neutral fields, and contrast-safe purple actions', () => {
  const copy = 'Manage your waste services business on-the-go with AI features';
  assert.ok(login.includes(copy)); assert.ok(android.includes(copy));
  assert.match(login, /private let primary = Color\(red: 112 \/ 255, green: 51 \/ 255, blue: 1\)/);
  assert.equal(login.match(/\.accentColor\(primary\)/g)?.length, 2);
  assert.match(login, /private var cardBackground: Color/);
  assert.match(android, /loginOverlay.setBackgroundColor\(dark \? Color.rgb\(20, 18, 26\) : Color.rgb\(250, 250, 252\)\)/);
  const field = java.slice(java.indexOf('private EditText input('), java.indexOf('private TextView text('));
  assert.match(field, /field.setTextColor\(dark \? Color.WHITE : Color.rgb\(33, 26, 43\)\)/);
  assert.match(field, /field.setBackgroundTintList\(null\)/);
  assert.match(field, /fill.setStroke\(dp\(1\)/);
  const luminance = (rgb) => rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum,n,i) => sum + n * [.2126,.7152,.0722][i], 0);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  assert.ok(contrast([112,51,255],[255,255,255]) >= 4.5);
  assert.ok(contrast([230,224,237],[98,89,110]) >= 4.5);
});

test('Android login retains validation/auth handlers while replacing raised/default button styling', () => {
  for (const name of ['googleButton','signInButton']) {
    assert.ok(android.includes(`${name}.setElevation(0);`));
    assert.ok(android.includes(`${name}.setStateListAnimator(null);`));
  }
  assert.match(android, /googleFill.setStroke\(dp\(1\), border\)/);
  assert.match(android, /googleButton.setBackgroundTintList\(null\)/);
  assert.match(android, /signInButton.setBackground\(onboardingFill\(ONBOARDING_PRIMARY, 14\)\)/);
  assert.match(android, /new int\[\] \{ disabled, ONBOARDING_PRIMARY \}/);
  assert.match(android, /new int\[\] \{ muted, Color.WHITE \}/);
  assert.equal(android.match(/ViewGroup.LayoutParams.MATCH_PARENT, dp\(50\)/g)?.length, 2);
  assert.match(android, /googleButton.setOnClickListener\(view -> submitGoogleLogin\(\)\)/);
  assert.match(android, /signInButton.setOnClickListener\(view -> submitNativeLogin\(\)\)/);
  assert.match(java, /if \(email.isEmpty\(\) \|\| password.isEmpty\(\)\) \{\s*showError\("Enter your email and password\."\)/);
});
