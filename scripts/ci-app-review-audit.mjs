import assert from 'node:assert/strict';
import { sign } from 'node:crypto';

const appId = '6756239268';
const buildId = '42d77462-f21e-4e50-8bef-c96bf692ee8b';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'ES256', kid: process.env.APP_STORE_CONNECT_KEY_ID, typ: 'JWT' })}.${encode({ iss: process.env.APP_STORE_CONNECT_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
const key = Buffer.from(process.env.APP_STORE_CONNECT_API_KEY_P8_BASE64, 'base64');
const token = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;

async function get(path) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result.errors)}`);
  return result;
}

const versions = await get(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=1.0.2&include=build`);
assert.equal(versions.data.length, 1, 'Expected exactly one iOS 1.0.2 version');
const version = versions.data[0];
const build = await get(`/v1/builds/${buildId}?include=app,preReleaseVersion,buildBetaDetail`);
assert.equal(build.data.attributes.version, '202609110306');
assert.equal(build.data.attributes.processingState, 'VALID');
assert.equal(build.data.relationships.app.data.id, appId);
const review = await get(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
const submissions = await get(`/v1/apps/${appId}/reviewSubmissions?include=items&limit=50`);
console.log(JSON.stringify({
  version: { id: version.id, attributes: version.attributes, selectedBuild: version.relationships.build.data },
  expectedBuild: { id: build.data.id, attributes: build.data.attributes, related: build.included.filter(item => item.type !== 'apps') },
  reviewDetail: { id: review.data.id, demoAccountRequired: review.data.attributes.demoAccountRequired, credentialsPresent: Boolean(review.data.attributes.demoAccountName && review.data.attributes.demoAccountPassword), notesPresent: Boolean(review.data.attributes.notes) },
  submissions: submissions.data.map(item => ({ id: item.id, attributes: item.attributes, items: item.relationships.items.data })),
  submissionItems: submissions.included,
}, null, 2));
