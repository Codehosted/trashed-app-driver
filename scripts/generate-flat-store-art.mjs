import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PALETTE = { background: '#faf9fc', foreground: '#211a2b', muted: '#eeeaf3', secondary: '#625a6d', primary: '#7434ce' };
export const FORMATS = { ios: { width: 1320, height: 2868 }, android: { width: 1080, height: 1920 }, feature: { width: 1024, height: 500 } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function pngInfo(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16) !== 'IHDR') throw new Error('Expected a PNG image');
  const colorType = bytes[25];
  let transparency = colorType === 4 || colorType === 6;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (offset + length + 12 > bytes.length) throw new Error('Truncated PNG chunk');
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'tRNS') transparency = true;
    offset += length + 12;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType, hasAlpha: transparency };
}

function localPath(root, value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) throw new Error('Asset paths must be repository-relative');
  const resolved = path.resolve(root, value);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Asset path escapes repository');
  return resolved;
}

export function validateSource(source, target, bytes) {
  if (!['ios','android'].includes(target)) throw new Error('Unknown screenshot target');
  if (!source || !/^[a-f0-9]{64}$/.test(source.sha256 ?? '') || sha256(bytes) !== source.sha256) throw new Error('Source SHA-256 does not match');
  if (!source.provenance?.trim()) throw new Error('Source provenance is required');
  if (!['verified-current','legacy-draft'].includes(source.status)) throw new Error('Source verification status is required');
  if (!['ios','android','web'].includes(source.platform)) throw new Error('Source platform is required');
  if (source.platform !== target && !(source.platform === 'web' && source.noPlatformChrome === true && source.status === 'legacy-draft')) throw new Error('Do not put another platform\'s chrome in store screenshots');
  let localCapture = false;
  try { localCapture = ['http://localhost:3000','http://127.0.0.1:3000'].includes(new URL(source.captureUrl).origin); } catch {}
  if (source.status === 'verified-current' && (!source.capturedAt || !source.reviewedBy || !localCapture)) throw new Error('Current captures require date, reviewer and localhost:3000 provenance');
  return pngInfo(bytes);
}

const escape = (value) => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const svg = (width, height, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);

async function textLayer(sharp, font, value, size, color, left, top, maxWidth) {
  const input = await sharp({ text: { text: `<span foreground="${color}">${escape(value)}</span>`, font: `Poppins Bold ${size}`, fontfile: font, rgba: true } }).png().toBuffer();
  const meta = pngInfo(input);
  if (meta.width > maxWidth) throw new Error(`Text exceeds its frame: ${value}`);
  return { input, left, top };
}

async function portrait(sharp, font, sourceBytes, spec, iconBytes) {
  const headline = spec.headline ?? ['Your business.', 'Your routes.', 'One app.'];
  if (headline.length !== 3 || headline.some((line) => typeof line !== 'string' || !line.trim())) throw new Error('Portrait headline needs three non-empty lines');
  const { width, height } = FORMATS[spec.platform];
  const scale = width / 1320;
  const n = (value) => Math.round(value * scale);
  const margin = n(88);
  const shotTop = spec.platform === 'ios' ? 968 : 692;
  const shotBottom = height - n(120);
  const titleY = spec.platform === 'ios' ? [265,411,557] : [184,294,404];
  const titleSize = spec.platform === 'ios' ? 124 : 94;
  const panel = { x: margin, y: shotTop - n(42), width: width - margin * 2, height: shotBottom - shotTop + n(58) };
  const frame = svg(width,height,`<rect width="100%" height="100%" fill="${PALETTE.background}"/><rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${n(24)}" fill="${PALETTE.muted}"/>`);
  const iconSize = n(80);
  const overlays = [{ input: await sharp(iconBytes).resize(iconSize,iconSize).png().toBuffer(), left: margin, top: n(84) }];
  overlays.push(await textLayer(sharp,font,'trashed',n(46),PALETTE.foreground,margin+iconSize+n(22),n(101),n(600)));
  overlays.push(await textLayer(sharp,font,headline[0],titleSize,PALETTE.foreground,margin,titleY[0],width-margin*2));
  overlays.push(await textLayer(sharp,font,headline[1],titleSize,PALETTE.foreground,margin,titleY[1],width-margin*2));
  overlays.push(await textLayer(sharp,font,headline[2],titleSize,PALETTE.primary,margin,titleY[2],width-margin*2));
  overlays.push(await textLayer(sharp,font,spec.subtitle ?? 'For vendors and drivers.',n(39),PALETTE.secondary,margin,spec.platform==='ios'?754:558,width-margin*2));
  const resized = await sharp(sourceBytes).resize({ width: panel.width-n(80), height: shotBottom-shotTop-n(30), fit:'inside' }).png().toBuffer();
  const shot = pngInfo(resized);
  const x = Math.round((width-shot.width)/2);
  const y = shotTop + Math.round((shotBottom-shotTop-n(30)-shot.height)/2);
  overlays.push({input:svg(shot.width+n(24),shot.height+n(24),`<rect width="100%" height="100%" rx="${n(14)}" fill="#ffffff"/>`),left:x-n(12),top:y-n(12)});
  overlays.push({input:resized,left:x,top:y});
  const draft = spec.source.status !== 'verified-current';
  overlays.push(await textLayer(sharp,font,draft?'DRAFT · legacy UI capture':'Trashed · your working day, connected',n(22),PALETTE.secondary,margin,height-n(58),width-margin*2));
  return sharp(frame).composite(overlays).flatten({background:PALETTE.background}).removeAlpha().png({compressionLevel:9}).toBuffer();
}

async function featureGraphic(sharp,font,iconBytes) {
  const {width,height}=FORMATS.feature;
  const frame=svg(width,height,`<rect width="100%" height="100%" fill="${PALETTE.background}"/><rect x="710" width="314" height="500" fill="${PALETTE.muted}"/>`);
  const overlays=[{input:await sharp(iconBytes).resize(232,232).png().toBuffer(),left:751,top:134}];
  for(const [label,size,color,x,y,max] of [['trashed',27,PALETTE.primary,52,40,600],['Your business.',63,PALETTE.foreground,52,124,630],['Your routes.',63,PALETTE.foreground,52,202,630],['One app.',63,PALETTE.primary,52,280,630],['For vendors and drivers.',23,PALETTE.secondary,52,410,630]]) overlays.push(await textLayer(sharp,font,label,size,color,x,y,max));
  return sharp(frame).composite(overlays).flatten({background:PALETTE.background}).removeAlpha().png({compressionLevel:9}).toBuffer();
}

export async function generateStoreArtwork(configPath,root=ROOT) {
  const config=JSON.parse(await readFile(configPath,'utf8'));
  const outputDir=localPath(root,config.outputDirectory);
  const font=localPath(root,config.font);
  const icon=localPath(root,config.icon);
  process.env.FONTCONFIG_PATH=path.dirname(font);
  const pairedPackage=process.env.TRASHED_WEB_PACKAGE_JSON ?? path.resolve(root,'../trashed-app/package.json');
  const require=createRequire(pairedPackage);
  const sharp=require('sharp');
  const iconBytes=await readFile(icon);
  await mkdir(outputDir,{recursive:true});
  const manifest={schemaVersion:1,artDirection:'Flat Trashed OG',palette:PALETTE,renderer:{sharp:sharp.versions.sharp,vips:sharp.versions.vips,pango:sharp.versions.pango},generatedFromConfig:path.relative(root,configPath),configSha256:sha256(await readFile(configPath)),generatorSha256:sha256(await readFile(fileURLToPath(import.meta.url))),font:{file:config.font,sha256:sha256(await readFile(font))},icon:{file:config.icon,sha256:sha256(iconBytes)},assets:[]};
  for(const spec of config.screenshots) {
    if(!/^[a-z0-9-]+\.png$/.test(spec.output)) throw new Error('Output must be a simple PNG filename');
    const sourceBytes=await readFile(localPath(root,spec.source.file));
    const sourceMeta=validateSource(spec.source,spec.platform,sourceBytes);
    const output=await portrait(sharp,font,sourceBytes,spec,iconBytes);
    const target=path.join(outputDir,spec.output);
    await writeFile(target,output);
    manifest.assets.push({file:path.relative(root,target),platform:spec.platform,...pngInfo(output),sha256:sha256(output),status:spec.source.status==='verified-current'?'review-required':'draft-do-not-upload',source:{...spec.source,...sourceMeta},transform:'contained proportional resize; no UI redraw, no screenshot crop, no device chrome added'});
  }
  const feature=await featureGraphic(sharp,font,iconBytes);
  const featurePath=path.join(outputDir,'feature-graphic-1024x500.png');
  await writeFile(featurePath,feature);
  manifest.assets.push({file:path.relative(root,featurePath),platform:'feature',...pngInfo(feature),sha256:sha256(feature),status:'review-required',source:null,transform:'brand typography and canonical icon; no represented UI'});
  await writeFile(path.join(outputDir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
  return manifest;
}

export function verifyManifest(manifest,root=ROOT) {
  for(const input of [manifest.font,manifest.icon]) {
    if(sha256(readFileSync(localPath(root,input.file)))!==input.sha256) throw new Error(`Input SHA-256 mismatch: ${input.file}`);
  }
  if(sha256(readFileSync(localPath(root,manifest.generatedFromConfig)))!==manifest.configSha256) throw new Error('Config SHA-256 mismatch');
  if(sha256(readFileSync(fileURLToPath(import.meta.url)))!==manifest.generatorSha256) throw new Error('Generator changed; regenerate artwork');
  for(const asset of manifest.assets) {
    const bytes=readFileSync(localPath(root,asset.file));
    const dimensions=FORMATS[asset.platform];
    const info=pngInfo(bytes);
    if(!dimensions || info.width!==dimensions.width || info.height!==dimensions.height || info.hasAlpha || info.colorType!==2) throw new Error(`Invalid dimensions or non-RGB image: ${asset.file}`);
    if(sha256(bytes)!==asset.sha256) throw new Error(`Output SHA-256 mismatch: ${asset.file}`);
    if(asset.source) validateSource(asset.source,asset.platform,readFileSync(localPath(root,asset.source.file)));
  }
  return true;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args[0]==='--verify') {
    const manifest=JSON.parse(readFileSync(path.resolve(args[1] ?? 'app-store-assets/2026-09/manifest.json'),'utf8'));
    verifyManifest(manifest); console.log(`Verified ${manifest.assets.length} RGB assets, dimensions and hashes.`);
  } else {
    const manifest=await generateStoreArtwork(path.resolve(args[0] ?? 'app-store-assets/2026-09/config.json'));
    verifyManifest(manifest); console.log(`Generated ${manifest.assets.length} assets. Review status in manifest.json before upload.`);
  }
}
