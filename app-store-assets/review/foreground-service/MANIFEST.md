# Google Play production submission evidence

## Submission snapshot

- Android package: `com.trashed.driver`
- Production release: `1.0.1 (2)`
- Submitted: 2026-07-19
- Play Console state after submission: **Changes in review**
- Production availability: United States

This records the submission state. It does not claim Google Play approval or public availability.

## Foreground-service declaration evidence

The declaration uses the **User-initiated location sharing** purpose. The 29-second reviewer video is assembled from actual Android screenshots and an actual ADB lock-screen recording. No reviewer credentials, permission dialogs, taps, or app states were fabricated.

Video metadata:

- Duration: 29.000 seconds
- Dimensions: 720x1280 portrait
- Codec: H.264
- Frame rate: 30 fps
- Pixel format: yuv420p
- Audio: none

Files:

- `trashed-driver-fgs-declaration.mp4` — reviewer demonstration video
- `trashed-driver-fgs-storyboard.png` — visual storyboard/contact sheet
- `trashed-driver-fgs-storyboard.md` — scene timing, source captures, and claim boundaries
- `SHA256SUMS.txt` — SHA-256 hashes for all three evidence files
- `trashed-driver-fgs-declaration.mp4.sha256` — standalone video hash

The public video-hosting URL used by Google Play is intentionally excluded from the repository.

## Other declaration evidence

- Advertising ID declaration: **No**
- Tracked Android manifest verified with no `android.permission.AD_ID` declaration.
- Reviewer password remains in macOS Keychain service `com.codehosted.trashed-driver.play-reviewer`; no password is stored here.

Verify the archive:

```sh
cd app-store-assets/review/foreground-service
shasum -a 256 -c SHA256SUMS.txt
shasum -a 256 -c trashed-driver-fgs-declaration.mp4.sha256
```
