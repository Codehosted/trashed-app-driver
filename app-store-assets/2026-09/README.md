# September 2026 — flat Trashed store artwork

**Review drafts. Nothing in this folder has been uploaded.**

The cover frames follow the website's OG palette and Poppins Bold typography:
`#faf9fc` / `#211a2b` / `#eeeaf3` / `#625a6d` / `#7434ce`.
No gradients, shadows, artificial device chrome, fabricated dashboard rows, or
invented completed orders. Source UI is resized proportionally and kept whole.

## Revised showcase direction — September 14 feedback

The nested framed Customers/login covers below were not selected as the product-showcase direction. New direction: an edge-to-edge map, an enlarged route card, and a driver marker with its context window open. No outer purple mats or device border.

- [Map-led showcase — Danny and chat context](concepts/map-route-showcase-v6.png)
- [Exact built-in imagegen edit prompt](concepts/map-route-showcase-v6-prompt.md)
- [Dimensions, hash, source roles, and limitations](concepts/map-route-showcase-v6-manifest.json)

This is an **AI-composed marketing concept**, not a native capture or proof of live activity. Its route vocabulary comes from the existing map asset. The current 851×1848 preview still needs creative approval and final store exports; it is deliberately separate from the verified-capture manifest. V6 keeps the corrected black wordmark and purple symbol directly on the map, without a logo tile. The driver is named Danny as requested, using the existing project avatar and two illustrative chat bubbles. The exchange is sample artwork, not a sent conversation. No app UI, orders, or messages changed. Earlier versions and prompts remain preserved. Older framed assets are retained for provenance, not silently replaced with generated UI.

## Trisha companion artwork

- [Trisha — messaging, Call Center, Digital Assistant](concepts/trisha-mobile-showcase-v4.png)
- [Latest built-in imagegen edit prompt](concepts/trisha-mobile-showcase-v4-prompt.md)
- [Dimensions, hash, references, and limitations](concepts/trisha-mobile-showcase-v4-manifest.json)

The existing Trisha avatar anchors this companion concept. Feature labels use lighter, staggered typography; the smaller Customer messaging label sits beside its bubble icon. The bold purple “all in your phone.” styling remains the payoff. Her shirt has a Trisha nametag with the brand symbol. Current preview is 851×1847; earlier versions and their prompts remain available. This is generated marketing artwork, not native UI or evidence that any call/message occurred. Creative approval and final store exports are still required.

## Outputs

- `ios-cover-review-1320x2868.png` — current vendor Customers page, real iPhone
  17 Pro Max / iOS 26.5 simulator capture from the approved local instance,
  September 14 at 15:15:24 EDT. The three `example.invalid` customer fixtures
  are disposable local test data, not real customer records.
- `ios-onboarding-review-1320x2868.png` — current iOS simulator walkthrough,
  captured and visually reviewed by the root release task against
  `http://localhost:3000/vendor/dashboard`, September 14 at 15:10 EDT.
  Source verified; still a release-review draft, not store-approved.
- `android-cover-review-1080x1920.png` — current native Android sign-in screen,
  captured on a disposable API 36 emulator September 14 at 16:11:01 EDT. The
  packaged app uses `http://localhost:3000/app?source=trashed-app`. The actual
  native status/navigation contrast was corrected before capture; no image
  retouch, authentication, orders, or phone navigation preceded the screenshot.
- `feature-graphic-1024x500.png` — clean brand/copy/icon graphic; no UI claims.
- `manifest.json` — exact inputs, source/output SHA-256, dimensions, pixel
  format, provenance, generation inputs, and review status.

Both platform covers now use current, reviewed local native captures. The
Android cover describes sign-in, not an authenticated dashboard. The original
legacy concept covers were replaced; the historical chrome-free web capture
`app-store-assets/sources/ios-6.9/driver-route-map.png` remains unchanged for
provenance-validation tests, not as release artwork. All outputs remain
review-required drafts until separately approved for store submission.
The older file named `03-vendor-dashboard-webview.png` was inspected and is
actually a login page; it was deliberately not used.

## Regenerate from verified captures

1. Capture this release on the appropriate device against `localhost:3000`,
   using approved non-sensitive local data. Root release task owns capture and
   approval. Do not create orders or make calls to improve artwork.
2. Put PNGs in `app-store-assets/sources/2026-09/`.
3. For each platform, replace the corresponding `config.json` source record:
   `file`, exact `sha256`, `platform`, `status: verified-current`, `provenance`,
   `capturedAt`, `reviewedBy`, and the local `captureUrl`. Use a clean output
   filename without `draft` after the source is actually verified.
4. Run `node scripts/generate-flat-store-art.mjs` from this repository.
5. Run `node scripts/generate-flat-store-art.mjs --verify` and
   `node --test tests/flat-store-art.test.mjs`.
6. Inspect every image at full size and phone-thumbnail size. Store upload
   requires a separate approval; `review-required` is not store approval.

Rendering uses the paired website's installed Sharp, not a new dependency.
Set `TRASHED_WEB_PACKAGE_JSON` to that repository's absolute `package.json`
when it is not the sibling `../trashed-app`. Font files and their SIL OFL
license are included. Dimension/hash/alpha tests and `--verify` use only Node
built-ins and work without the website or Sharp installed.

Platform protections: iOS captures cannot be rendered into Android assets;
web captures are permitted only as explicitly legacy, chrome-free drafts.
Source SHA mismatch, missing provenance, missing reviewer details, unexpected
output size, transparent PNG, or edited generation inputs fail verification.

Reference specifications checked September 14, 2026:
[Apple screenshots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
and [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
