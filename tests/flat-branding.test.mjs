import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
test('flat icon keeps the real vector mark with high contrast and no raster upscale', () => {
  const svg = readFileSync(new URL('app-store-assets/artwork/trashed-driver-icon.svg', root), 'utf8');
  assert.match(svg, /fill="#7434ce"/);
  assert.match(svg, /fill:#ffffff/);
  assert.match(svg, /<path /);
  assert.doesNotMatch(svg, /gradient|<image|filter/i);
  const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  assert.ok(1.05 / (luminance([0x74, 0x34, 0xce]) + 0.05) > 6, 'white mark must contrast at least 6:1');
});

test('all packaged icon rasters match canonical branding', () => {
  const result = spawnSync(process.execPath, ['scripts/sync-flat-branding.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
