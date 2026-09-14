# September 2026 — flat Trashed store artwork

**Review drafts. Nothing in this folder has been uploaded.**

The cover frames follow the website's OG palette and Poppins Bold typography:
`#faf9fc` / `#211a2b` / `#eeeaf3` / `#625a6d` / `#7434ce`.
No gradients, shadows, artificial device chrome, fabricated dashboard rows, or
invented completed orders. Source UI is resized proportionally and kept whole.

## Outputs

- `ios-cover-review-1320x2868.png` — current vendor Customers page, real iPhone
  17 Pro Max / iOS 26.5 simulator capture from the approved local instance,
  September 14 at 15:15:24 EDT. The three `example.invalid` customer fixtures
  are disposable local test data, not real customer records.
- `ios-onboarding-review-1320x2868.png` — current iOS simulator walkthrough,
  captured and visually reviewed by the root release task against
  `http://localhost:3000/vendor/dashboard`, September 14 at 15:10 EDT.
  Source verified; still a release-review draft, not store-approved.
- `android-cover-draft-1080x1920.png` — Android-size concept, the same legacy
  **chrome-free web UI**, not an iOS device screenshot.
- `feature-graphic-1024x500.png` — clean brand/copy/icon graphic; no UI claims.
- `manifest.json` — exact inputs, source/output SHA-256, dimensions, pixel
  format, provenance, generation inputs, and review status.

The remaining Android concept source is the previously committed
`app-store-assets/sources/ios-6.9/driver-route-map.png` (390×844), documented in
`app-store-assets/README.md` as a bare web capture. Its legacy UI is **not proof
of this release**. A visible DRAFT label stays on the Android concept cover.
The legacy iOS concept was replaced with the current Customers capture above.
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
