# Native chat / push checkpoint — 2026-09-16

This is a **test-build checkpoint**, not a production-native-chat completion claim. The paired website keeps `TRASHED_NATIVE_CHAT_ENABLED` off by default. TestFlight and Android checkpoint builds point to the production backend; existing users retain the web chat until compatible website code is deployed and the native rollout gate is deliberately enabled.

## Included
- Native UIKit and Android widgets for measured chat components, with shared fonts/real avatar, bounded PNG icons/photo previews, light/dark styling, fixed composer/footer, controlled inputs and native date controls.
- Existing web controller/backend endpoints retained; native events use context/revision/control IDs. Current map data and pin interactions remain bound to React state/callbacks.
- Scoped protected/no-backup screen caches, strict geometry/raster/action validation, native file-picker/dictation lifecycle and cancellation handling.
- Android dedicated main-frame/origin-checked chat channel; existing plugins keep their background-safe legacy callback transport.
- Foreground/background push presentation/channel metadata, cancellable registration and dismiss/tap distinction in paired website.
- Shared canonical backend origin plus start route. iOS overrides its start URL and clears the shared appStartPath to prevent `/app` being appended twice.

## Verification boundary
The branch checkpoint has passing web TypeScript and 184 focused web tests. Mobile source suite now has 156 passing checks and two artifact-dependent skips after the startup regression fix and six Slack-sender tests; rerun exact committed sources in CI. The startup regression was observed failing before the fix.

Earlier native evidence includes successful iOS/Android builds, 44 iOS policy/cache checks, measured light/dark renderer tests, actual system-picker selection/cancellation, input-boundary/stale-session checks, and native date editing. Android secure-bridge tests passed including retained callback delivery after more than five minutes backgrounded; this is transport proof, not full GPS-to-backend field verification. Real Android FCM foreground/background alerts were separately observed.

## Still not certified
- Complete authenticated native controller/backend workflows with the exact new website/native pair.
- Final release-wide visual/accessibility comparison across every rich card/state.
- Successful speech transcription on actual hardware, physical APNs delivery and field GPS behavior. Physical-device-only checks were explicitly excluded by the user.
- Google Play/App Store publication. TestFlight acceptance or a debug APK artifact is not store production release.

## Repeatable builds
- iOS: dispatch `.github/workflows/testflight.yml` on this branch with a unique build number. It verifies signed Apple/APNs capabilities and waits for the exact uploaded build to become valid/internal-test ready.
- Android: dispatch `.github/workflows/testflight.yml` for both platforms, or `.github/workflows/android-checkpoint.yml` once available on the default branch. It validates backend/Firebase configuration, builds debug app/test APKs and uploads checksum + commit evidence. Debug keys are not Play release keys.
- Platform-specific build notifications are configured as described in [build-slack-notifications.md](build-slack-notifications.md). Initial sending is disabled pending channel/template approval.

No secret/session files, private QA credentials, provider tokens or local logs belong in either repository. Synthetic fixtures contain no business/customer data. Production accounts and credential files are managed outside Git.
