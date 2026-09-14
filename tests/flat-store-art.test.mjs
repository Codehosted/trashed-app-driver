import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FORMATS, PALETTE, pngInfo, sha256, validateSource, verifyManifest } from '../scripts/generate-flat-store-art.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFileSync(path.join(root,name));
const manifest=JSON.parse(read('app-store-assets/2026-09/manifest.json'));
const sourceFile='app-store-assets/sources/ios-6.9/driver-route-map.png';
const source={file:sourceFile,sha256:sha256(read(sourceFile)),platform:'web',noPlatformChrome:true,status:'legacy-draft',provenance:'Legacy committed chrome-free web capture; test fixture only.'};
const sourceBytes=read(source.file);

test('artifact dimensions, RGB format, source hashes and output hashes verify without Sharp',()=>{
  assert.equal(verifyManifest(manifest,root),true);
  for(const asset of manifest.assets) {
    assert.deepEqual({width:asset.width,height:asset.height},FORMATS[asset.platform]);
    assert.equal(pngInfo(read(asset.file)).hasAlpha,false);
    assert.equal(asset.colorType,2);
  }
});

test('palette is flat and matches Trashed OG artwork',()=>{
  assert.deepEqual(PALETTE,{background:'#faf9fc',foreground:'#211a2b',muted:'#eeeaf3',secondary:'#625a6d',primary:'#7434ce'});
  assert.doesNotMatch(read('scripts/generate-flat-store-art.mjs').toString(),/linearGradient|radialGradient|drop-shadow/);
});

test('legacy concept artwork stays visibly draft and cannot become verified silently',()=>{
  for(const asset of manifest.assets.filter(asset=>asset.source?.status==='legacy-draft')) assert.equal(asset.status,'draft-do-not-upload');
  assert.throws(()=>validateSource({...source,status:'verified-current'},'ios',sourceBytes),/platform|require/);
});

test('rejects changed source pixels and absent provenance',()=>{
  assert.throws(()=>validateSource({...source,sha256:'0'.repeat(64)},'ios',sourceBytes),/SHA-256/);
  assert.throws(()=>validateSource({...source,provenance:''},'ios',sourceBytes),/provenance/);
});

test('never places Apple chrome in Android artwork',()=>{
  assert.throws(()=>validateSource({...source,platform:'ios'},'android',sourceBytes),/platform/);
  assert.throws(()=>validateSource({...source,noPlatformChrome:false},'android',sourceBytes),/platform/);
});

test('current captures require local testing provenance and review metadata',()=>{
  const current={...source,platform:'ios',status:'verified-current',capturedAt:'2026-09-14',reviewedBy:'Local device reviewer',captureUrl:'http://localhost:3000/vendor/dashboard'};
  assert.equal(validateSource(current,'ios',sourceBytes).width,390);
  assert.throws(()=>validateSource({...current,captureUrl:'https://trashed.app/vendor/dashboard'},'ios',sourceBytes),/localhost/);
  assert.throws(()=>validateSource({...current,captureUrl:'http://localhost:3000.evil.example'},'ios',sourceBytes),/localhost/);
  assert.throws(()=>validateSource({...current,reviewedBy:''},'ios',sourceBytes),/reviewer/);
});

test('rejects tampered output manifests and path traversal',()=>{
  const changed=structuredClone(manifest); changed.assets[0].sha256='0'.repeat(64);
  assert.throws(()=>verifyManifest(changed,root),/Output SHA-256/);
  changed.assets[0].file='../outside.png';
  assert.throws(()=>verifyManifest(changed,root),/escapes repository/);
});

test('PNG inspection rejects invalid bytes and notices alpha',()=>{
  assert.throws(()=>pngInfo(Buffer.from('not a PNG')),/Expected/);
  const bytes=Buffer.from(read(manifest.assets[0].file)); bytes[25]=6;
  assert.equal(pngInfo(bytes).hasAlpha,true);
  assert.equal(sha256(sourceBytes),source.sha256);
});
