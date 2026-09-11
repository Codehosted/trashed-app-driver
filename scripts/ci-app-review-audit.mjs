import assert from 'node:assert/strict';
import { sign } from 'node:crypto';

const appId = '6756239268';
const buildId = '42d77462-f21e-4e50-8bef-c96bf692ee8b';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'ES256', kid: process.env.APP_STORE_CONNECT_KEY_ID, typ: 'JWT' })}.${encode({ iss: process.env.APP_STORE_CONNECT_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
const key = Buffer.from(process.env.APP_STORE_CONNECT_API_KEY_P8_BASE64, 'base64');
const token = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;

async function api(path, data) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method: data ? 'PATCH' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify({ data }) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result.errors)}`);
  return result;
}

const versions = await api(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=1.0.2&include=build`);
assert.equal(versions.data.length, 1, 'Expected exactly one iOS 1.0.2 version');
const version = versions.data[0];
const build = await api(`/v1/builds/${buildId}?include=app,preReleaseVersion,buildBetaDetail`);
assert.equal(build.data.attributes.version, '202609110306');
assert.equal(build.data.attributes.processingState, 'VALID');
assert.equal(build.data.relationships.app.data.id, appId);
const review = await api(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
const submissions = await api(`/v1/apps/${appId}/reviewSubmissions?include=items&limit=50`);
console.log(JSON.stringify({
  version: { id: version.id, attributes: version.attributes, selectedBuild: version.relationships.build.data },
  expectedBuild: { id: build.data.id, attributes: build.data.attributes, related: build.included.filter(item => item.type !== 'apps') },
  reviewDetail: { id: review.data.id, demoAccountRequired: review.data.attributes.demoAccountRequired, credentialsPresent: Boolean(review.data.attributes.demoAccountName && review.data.attributes.demoAccountPassword), notesPresent: Boolean(review.data.attributes.notes) },
  submissions: submissions.data.map(item => ({ id: item.id, attributes: item.attributes, items: item.relationships.items.data })),
  submissionItems: submissions.included,
}, null, 2));

if (process.argv.includes('--submit-202609110306')) {
  const submissionId = '99c0992e-ec20-432a-9385-26159c16e9b8';
  assert.equal(version.id, '09b02da1-a615-445e-9ac0-3dcca41b8c23');
  assert.equal(build.data.attributes.expired, false);
  assert.equal(build.data.attributes.buildAudienceType, 'APP_STORE_ELIGIBLE');
  assert.equal(build.data.attributes.usesNonExemptEncryption, false);
  assert.equal(build.included.find(item => item.type === 'preReleaseVersions').attributes.version, '1.0.2');
  const current = (await api(`/v1/reviewSubmissions/${submissionId}?include=appStoreVersionForReview,items`)).data;
  assert.equal(current.relationships.appStoreVersionForReview.data.id, version.id);
  if (['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(current.attributes.state)) {
    assert.equal(version.relationships.build.data.id, buildId);
    console.log(`Already submitted exact build: ${current.attributes.state}`);
    process.exit(0);
  }
  assert.equal(current.attributes.state, 'UNRESOLVED_ISSUES');
  assert.equal(current.relationships.items.data.length, 1);
  const itemId = current.relationships.items.data[0].id;
  assert.equal(itemId, 'OTljMDk5MmUtZWMyMC00MzJhLTkzODUtMjYxNTljMTZlOWI4fDZ8ODgwNDI0MzIy');
  assert.equal(review.data.attributes.demoAccountRequired, true);
  assert.ok(review.data.attributes.demoAccountName && review.data.attributes.demoAccountPassword);
  const readiness = await fetch('https://trashed.app/api/auth/mobile/apple');
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).configured, true);
  const login = await fetch('https://trashed.app/api/auth/mobile/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: review.data.attributes.demoAccountName, password: review.data.attributes.demoAccountPassword }),
    signal: AbortSignal.timeout(30000),
  });
  const loginResult = await login.json().catch(() => null);
  assert.equal(login.status, 200, 'Existing App Review account must authenticate before resubmission');
  assert.equal(loginResult?.success, true, 'Existing App Review account authentication failed');
  assert.ok(login.headers.get('set-cookie'), 'Expected authenticated review session cookie');
  console.log('Existing App Review credentials verified against production; credentials preserved and not logged.');

  const marker = 'App Review resubmission - build 202609110306';
  const update = `${marker}\n\nGuideline 4.8: The native Driver Sign In screen now offers Continue with Apple alongside Google and email sign-in. It uses the standard Apple sign-in control and requests only the email scope. Apple Hide My Email is supported; existing drivers can explicitly link Apple to their existing account while retaining their private Apple email. The Apple login flow does not collect app interactions for advertising. Logout and expired sessions return to the same native sign-in options.\n\nGuideline 2.1(a): The signed app now includes NSCameraUsageDescription and NSPhotoLibraryUsageDescription to address the missing privacy declarations when opening Take Photo. These declarations are checked in the archived app before upload.\n\nRelease-build checks on iPhone 17 Pro Max Simulator, iOS 26.5, against the production backend passed: email sign-in, invalid-password recovery, logout, repeat sign-in, and authenticated cold relaunch; no crashes observed. Full Apple Account sign-in and physical camera capture were not retested in this verification pass.\n\nExisting App Review account credentials and driver-review instructions below remain unchanged.\n\n`;
  const previousNotes = review.data.attributes.notes || '';
  const notes = previousNotes.includes(marker) ? previousNotes : update + previousNotes;
  assert.ok(notes.length <= 4000, 'Preserve existing review notes without truncation');

  await api(`/v1/appStoreReviewDetails/${review.data.id}`, { type: 'appStoreReviewDetails', id: review.data.id, attributes: { notes } });
  console.log('Review notes updated; existing review credentials unchanged.');
  await api(`/v1/appStoreVersions/${version.id}`, { type: 'appStoreVersions', id: version.id, relationships: { build: { data: { type: 'builds', id: buildId } } } });
  const selected = (await api(`/v1/appStoreVersions/${version.id}?include=build`)).data;
  assert.equal(selected.relationships.build.data.id, buildId);
  console.log('Selected exact App Store build 1.0.2 (202609110306).');
  await api(`/v1/reviewSubmissionItems/${itemId}`, { type: 'reviewSubmissionItems', id: itemId, attributes: { resolved: true } });
  await api(`/v1/reviewSubmissions/${submissionId}`, { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true } });

  for (let attempt = 0; attempt < 12; attempt++) {
    const result = (await api(`/v1/reviewSubmissions/${submissionId}?include=items`)).data;
    const finalVersion = (await api(`/v1/appStoreVersions/${version.id}?include=build`)).data;
    assert.equal(finalVersion.relationships.build.data.id, buildId);
    if (['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(result.attributes.state)) {
      console.log('APP_REVIEW_RESUBMITTED ' + JSON.stringify({ submissionId, buildId, version: '1.0.2', build: '202609110306', state: result.attributes.state, versionState: finalVersion.attributes.appVersionState, releaseType: finalVersion.attributes.releaseType, submittedDate: result.attributes.submittedDate }));
      process.exit(0);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Submission request sent but final review queue state not yet verified');
}
