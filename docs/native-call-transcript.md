# Native call transcript conversation

Both platforms parse the existing API's plain transcript into explicit speaker turns; no backend response or stored transcript changes. Recognized prefixes are Caller/Customer/User, Assistant/Agent/Trisha, and Operator/Human at line starts, optionally prefixed by recorded timestamps. Unstructured content stays text, not HTML; speakers/times are never guessed.

## Interaction
- Expanded call rows show a small conversation preview and Open conversation.
- Dedicated native conversation destination has speaker labels, differently aligned/tinted bubbles, Dynamic Type/scaled text, selectable content and multiline wrapping. It does not include the call-list search UI.
- Existing shared audio playback survives opening and returning; back preserves expanded row/list scroll state and does not reload data.
- Android clears conversation on session invalidation, suspend, refresh, and disposal; iOS observes model invalidation and uses existing host lifecycle cancellation.

## Verification
- `node --test tests/call-transcript.test.mjs`: compiled production Swift+Java parsers against same7fixtures;2tests pass.
- Full mobile Node suite:172tests,170pass,0fail,2skip.
- Full iOS Simulator app build succeeded. Loopback fixture UI shows4speaker turns; audio continues when returning; call-list request count unchanged. Visual artifacts under selected workspace outputs/native-transcript-ios-*.png.
- Android qualified `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest` passed;29JVMtests. Real emulator `NativeCallTranscriptScreenTest,NativeWorkspaceShellTest`: OK(2tests). Conversation test verifies split bubbles, hidden search, audio and list preservation, no additional list request and session-change clearing.

All runtime evidence is local synthetic QA. This work does not convert other app routes or remove the hybrid app shell. Do not describe the whole app as100%native.
