import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const text = (path) => read(path).toString('utf8');
const ios = text('ios/App/App/MainViewController.swift');
const android = text('android/app/src/main/java/com/trashed/driver/MainActivity.java');
const intro = ios.slice(ios.indexOf('private struct NativeAppOnboardingView'), ios.indexOf('private struct NativeDriverLoginView'));
const androidIntro = android.slice(android.indexOf('private void showNativeOnboarding'), android.indexOf('private void completeNativeOnboarding'));
const pages = JSON.parse(text('tests/fixtures/native-onboarding.json'));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

test('all three pages use byte-identical offline hero art on both native platforms', () => {
  assert.deepEqual(pages.map((page) => page.image), ['onboarding_business', 'onboarding_chat', 'onboarding_dispatch']);
  assert.deepEqual(pages.map((page) => page.title), ['Your waste service business in your pocket', 'Real-time customer chat', 'Hauler and dispatch']);
  assert.match(intro, /ForEach\(NativeOnboarding\.pages\.indices\)/);
  assert.match(intro, /step == NativeOnboarding\.pages\.count - 1/);
  assert.match(androidIntro, /onboardingStep == ONBOARDING_PAGES\.length - 1/);
  for (const draft of ['team', 'routes', 'trisha', 'notifications']) {
    assert.equal(existsSync(new URL(`ios/App/App/Assets.xcassets/onboarding_${draft}.imageset`, root)), false);
    assert.equal(existsSync(new URL(`android/app/src/main/res/drawable-nodpi/onboarding_${draft}.png`, root)), false);
  }
  for (const { image } of pages) {
    const source = read(`app-store-assets/2026-09/onboarding/${image.replace('_', '-')}.png`);
    assert.equal(source.subarray(1, 4).toString('ascii'), 'PNG');
    const width = source.readUInt32BE(16), height = source.readUInt32BE(20);
    assert.ok(width >= 600 && height >= 400 && width > height, `${image} needs real landscape art`);
    assert.ok(width * height <= 4_000_000 && source.byteLength <= 6 * 1024 * 1024, 'Offline imagery must stay bounded');
    const asset = JSON.parse(text(`ios/App/App/Assets.xcassets/${image}.imageset/Contents.json`));
    assert.equal(asset.images[0].filename, `${image}.png`);
    assert.equal(sha(read(`ios/App/App/Assets.xcassets/${image}.imageset/${image}.png`)), sha(source));
    assert.equal(sha(read(`android/app/src/main/res/drawable-nodpi/${image}.png`)), sha(source));
    assert.ok(ios.includes(`image: "${image}"`));
    assert.ok(android.includes(`R.drawable.${image}`));
  }
});

test('native wordmark retains the approved shape rather than generating or spelling a fake logo', () => {
  const source = read('app-store-assets/2026-09/concepts/references/trashed-wordmark-poppins-bold.png');
  assert.equal(sha(read('ios/App/App/Assets.xcassets/onboarding_wordmark.imageset/onboarding_wordmark.png')), sha(source));
  assert.equal(sha(read('android/app/src/main/res/drawable-nodpi/onboarding_wordmark.png')), sha(source));
  assert.match(intro, /Image\("onboarding_wordmark"\)\s*\.renderingMode\(\.template\)/);
  assert.match(androidIntro, /wordmark.setColorFilter\(foreground\)/);
});

test('small approved purple symbol sits beside the unchanged wordmark', () => {
  const source = read('app-store-assets/2026-09/concepts/references/trashed-symbol-source.png');
  assert.equal(sha(read('ios/App/App/Assets.xcassets/onboarding_symbol.imageset/onboarding_symbol.png')), sha(source));
  assert.equal(sha(read('android/app/src/main/res/drawable-nodpi/onboarding_symbol.png')), sha(source));
  assert.match(intro, /HStack\(spacing: 8\) \{\s*Image\("onboarding_symbol"\)\s*\.renderingMode\(\.template\)/);
  assert.match(intro, /\.frame\(width: 28, height: 28\)\s*\.foregroundColor\(primary\)/);
  assert.match(intro, /Image\("onboarding_symbol"\)[^]*Image\("onboarding_wordmark"\)/);
  assert.match(androidIntro, /symbol.setImageTintList\(ColorStateList.valueOf\(ONBOARDING_PRIMARY\)\)/);
  assert.match(androidIntro, /symbolParams = new LinearLayout.LayoutParams\(dp\(28\), dp\(28\)\)/);
  assert.match(androidIntro, /symbolParams.setMarginEnd\(dp\(8\)\)/);
  assert.match(androidIntro, /brand.addView\(symbol, symbolParams\)[^]*brand.addView\(wordmark,/);
});

test('brand actions are flat purple with white text, never inherited green or raised buttons', () => {
  assert.match(intro, /Color\(red: 112 \/ 255, green: 51 \/ 255, blue: 1\)/);
  assert.match(intro, /\.background\(primary\)\s*\.foregroundColor\(\.white\)/);
  assert.match(android, /ONBOARDING_PRIMARY = Color.rgb\(112, 51, 255\)/);
  assert.match(androidIntro, /next.setBackground\(onboardingFill\(ONBOARDING_PRIMARY, 14\)\)/);
  assert.match(androidIntro, /next.setBackgroundTintList\(null\)/);
  assert.match(androidIntro, /next.setStateListAnimator\(null\)/);
  assert.doesNotMatch(intro + androidIntro, /0\.07, green: 0\.42|18, 107, 66|LinearGradient|RadialGradient|\.shadow\(/);
  const linear = (byte) => { const n = byte / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
  const luminance = .2126 * linear(112) + .7152 * linear(51) + .0722 * linear(255);
  assert.ok(1.05 / (luminance + .05) >= 4.5, 'White action labels need AA text contrast');
});

test('images fit without cropping while content scrolls separately from reachable actions', () => {
  assert.match(intro, /Image\(page.image\)\s*\.resizable\(\)\s*\.scaledToFit\(\)/);
  assert.match(intro, /ScrollView \{[^]*?pageContent[^]*?\.id\(step\)\s*actions/);
  assert.match(intro, /min\(300, max\(140, geometry.size.height \* 0.38\)\)/);
  assert.match(intro, /\.font\(\.title.bold\(\)\)\s*\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.match(intro, /\.frame\(maxWidth: \.infinity, minHeight: 54\)/);
  assert.match(intro, /accessibilityAddTraits\(\.isHeader\)/);
  assert.match(androidIntro, /hero.setScaleType\(ImageView.ScaleType.FIT_CENTER\)/);
  assert.doesNotMatch(intro.slice(intro.indexOf('Image(page.image)'), intro.indexOf('Text(page.title)')), /\.background\(|clipShape|shadow/);
  assert.doesNotMatch(androidIntro, /hero.setBackground|hero.setClipToOutline/);
  assert.match(androidIntro, /column.addView\(scroll, new LinearLayout.LayoutParams\(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1\)\)/);
  assert.match(androidIntro, /column.addView\(next, matchWrapParams\(\)\)/);
  assert.match(androidIntro, /next.setMinimumHeight\(dp\(54\)\)/);
  assert.match(androidIntro, /ViewCompat.setAccessibilityHeading\(paragraph, true\)/);
  assert.doesNotMatch(intro, /Image\(systemName:/);
  assert.doesNotMatch(androidIntro, /String.format/);
});
