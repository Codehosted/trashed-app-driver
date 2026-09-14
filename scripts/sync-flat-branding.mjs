#!/usr/bin/env bun
// Render the canonical vector directly; never upscale a raster logo.
// Rendering uses the paired website's existing Sharp. Verification is standalone.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = 'app-store-assets/artwork/trashed-driver-icon.svg';
const manifestPath = path.join(root, 'app-store-assets/artwork/icon-manifest.json');
const androidOnly = process.argv.includes('--android-only');
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(path.join(root, sourcePath));
const outputs = [
  ['app-store-assets/artwork/trashed-driver-icon-1024.png', 1024],
  ['app-store-assets/artwork/play-store-icon-512.png', 512],
];
const iconSet = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const { images } = JSON.parse(await readFile(path.join(root, iconSet, 'Contents.json'), 'utf8'));
for (const image of images) {
  if (image.filename) outputs.push([`${iconSet}/${image.filename}`, parseFloat(image.size) * parseFloat(image.scale)]);
}
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_store_art.png']) {
    outputs.push([`android/app/src/main/res/mipmap-${density}/${name}`, size]);
  }
}

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.sourceSha256 !== checksum(source)) throw new Error('Icon vector changed: regenerate branding.');
  for (const [relative, size] of outputs) {
    const bytes = await readFile(path.join(root, relative));
    if (manifest.outputs[relative] !== checksum(bytes) || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size || bytes[25] !== 2) {
      throw new Error(`Stale, wrong-size, or non-RGB icon: ${relative}`);
    }
  }
  console.log(`Verified ${outputs.length} flat Trashed icons.`);
} else {
  const webRoot = process.env.TRASHED_WEB_ROOT || path.resolve(root, '../trashed-app');
  const sharp = createRequire(path.join(webRoot, 'package.json'))('sharp');
  const playIcon = androidOnly
    ? await readFile(path.join(root, 'app-store-assets/artwork/play-store-icon-512.png'))
    : await sharp(source).resize(512, 512).flatten({ background: '#7434ce' }).removeAlpha().png().toBuffer();
  const manifest = { sourceSha256: checksum(source), outputs: {} };
  for (const [relative, size] of outputs) {
    const output = path.join(root, relative);
    if (!androidOnly || relative.startsWith('android/')) {
      const expected = await sharp(relative.startsWith('android/') ? playIcon : source).resize(size, size).flatten({ background: '#7434ce' }).removeAlpha().png().toBuffer();
      await writeFile(output, expected);
    }
    manifest.outputs[relative] = checksum(await readFile(output));
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Rendered ${androidOnly ? 15 : outputs.length} flat Trashed icons.`);
}
