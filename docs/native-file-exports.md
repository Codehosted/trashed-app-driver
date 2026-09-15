# Native file exports

## Text export — verified local candidate

The web app uses `TrashedFileExport.saveText({ filename, content })` for inline call transcripts, assistant chat transcripts, and domain-verification instructions. Ordinary browsers retain their download behavior. Native saves require an explicit Files/document destination and distinguish save from cancellation; old shells get an update message rather than a broken Blob download.

Native validation allows a safe ASCII `.txt` basename (120 bytes maximum), rejects traversal and extra options, and limits text to 5 MiB UTF-8. No caller-supplied path, network URL, recipient or credentials enter the native plugin. iOS uses a random private protected temporary file and cleans it after completion/cancellation or next launch. Android writes only to the chosen content URI, strips retained text from plugin options and does not restore transcript payloads after process death. Capacitor payload logging is disabled.

The configured top-level origin is checked. This is **not calling-frame authentication**. The plugin is a caller-provided-data sink, not an authenticated downloader or filesystem reader; cross-frame picker abuse is not ruled out by that check.

### Actual evidence

- Native suite: **103/103** at the text-only snapshot; report `../native-release-fixes-tests.log` in the paired-worktree parent.
- iOS 26.5 Simulator: actual CallAccordion → helper → Files → **On My iPhone** saved a **203-byte** synthetic Unicode transcript. SHA-256 `f9d378286a81c5679d5d60abbe5eda59dc619eadd1f15027e46aa330a0e63cb1`. Explicit cancel, reopen and retry worked; private staging was empty afterward.
- This runtime used a temporary, restored simulator-only preview bootstrap. It proves component/helper/plugin/file bytes, **not authentication or physical-device signing**. The normal `/app` build was restored and native sign-in visually checked afterward.
- Android: **2/2** registered-plugin intent/cancellation tests. Those tests did not exercise a real system picker destination or a JavaScript bridge round-trip.

Evidence directory: `artifacts/native-experience/text-export/`; root reports `ios-files-runtime-results.json` and `ios-restored-app-verification.json`. Artifacts are local/ignored, not uploaded customer files. No orders, calls, provider pushes or messages were sent.

## Remaining file parity

Recording exports now use normal browser-authenticated streaming into a bounded write-only native byte sink in the candidate source. Native cookie extraction, authenticated native HTTP, arbitrary URL proxies, whole-file Base64 and generic filesystem plugins are not part of the design. Implementation and device evidence must pass before this is called complete.

The shared chat preview still has a separate pending-local-image Blob download consumer. Existing remote invoice/attachment links use ordinary HTTP system-browser behavior; that needs runtime verification, not an assumption that text/recording tests cover every vendor export. No store upload or production release is established by these local file tests.


## Recording byte sink — candidate implementation

The web helper fetches only the current call's same-origin recording endpoint with ordinary WebView authentication, rejects redirects/auth failures/unsupported bodies, and awaits each bounded native write. Only MP3/WAV are supported by this recording contract. No native network/cookie authority is introduced.

Native `begin`, `write`, `finish`, and idempotent `cancel` maintain one export shared with text. A random ID, exact next offset, canonical Base64, 64 KiB decoded-chunk bound and 256 MiB staging ceiling are checked natively. A declared total must match; unknown-length completion additionally relies on the browser reaching actual EOF. Private staging is removed on errors/cancellation/navigation or a 60-second receiving-idle callback, and stale staging is removed after restart. Android retains the operation lock while an external picker is still open; a failed external document provider may refuse best-effort deletion of its partial destination.

### Current proof — 2026-09-15 UTC

- **106/106 full native tests** pass (`../native-recording-final-tests.log`), including compiled Swift/Java spool policies. The JVM harness supplies an Android Base64 shim; macOS Swift omits the iOS-only protection flag. Platform builds and runtime evidence remain distinct.
- Unsigned iOS Simulator and Android debug/test builds pass. Production resource URLs and the temporary iOS preview-controller override were restored. `loggingBehavior: none` is packaged.
- **6/6 Android runtime tests** pass in 21.236 seconds: 4 byte and 2 text cases. A 65,539-byte synthetic file was copied and read back exactly through a test-only content provider. Actual SDK navigation exposed an early listener-registration bug; registration now happens once after bridge construction. The final test verifies actual listener count and real navigation cleanup. Startup ANR and test-readiness failures are preserved, not counted as passes. The emulator was closed without a snapshot.
- This Android evidence uses intercepted picker results, **not actual Files UI or a JavaScript-to-native round-trip**. The test provider is absent from the production APK; only guarded synthetic test paths are exposed in the instrumentation package.
- The iOS recording fixture build is installed but **actual recording Save/Cancel remains unverified**. The first visual check found a clipped Download control; responsive grouping is fixed in source, but the Mac locked before visual recheck and saved-byte proof. Do not equate compiled code or the earlier text save with recording proof.
- The revised local WAV fixture is 96,044 bytes (six seconds), crossing the 64 KiB boundary. Its HTTP response was verified with SHA-256 `71d93ef76e5ff6087d522277e83309f1d8d790e9b756324dec73d216ea57cc75`. Expected saved filename: `recording_local-recording-preview.wav`.

Native reports: `artifacts/native-experience/byte-export/implementation-results.json`; web fixture/HTTP reports live in the paired-worktree parent. No real recording, call, order, message, or provider push was created or downloaded during this work.
