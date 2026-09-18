# iOS 1.0.7 navigation/assistant hotfix

## Scope
Correct the conditional native-root teardown that could expose the blank bootstrap WebView; keep visible native loading/recovery controls for failed or timed-out destination requests. Preserve Capacitor's original navigation policy and source guards through a forwarding delegate observer. Retry targets are same-origin workspace URLs; login and new native-root presentation invalidate the pending recovery surface and callbacks.

The paired backend PR598 fixes queued native render cancellation and newly mounted Send/Stop SVG projection gaps. This remains the existing native renderer with a web controller, NOT completion of the full-native app or on-device model/tool integration.

## Verification
- Actual production handoff function compiled/executed with recording UIKit/WebView doubles: pre-patch RED, post-patch GREEN. Covers loading/missing/detached destination, valid/unsafe paths, login and stale document generation.
- Full iOS Simulator build succeeded using Xcode. Installed on existing Trashed-Parity-QA; never replaced the physical phone app.
- Existing native Dashboard -> Trisha -> Assistant: connection-drop failure produced native Retry/Return to dashboard controls; return opened the native dashboard.
- A delayed page exceeded the bounded20-second deadline; native Retry remained visible, then retry after recovery reached the existing native assistant.
- Independent review identified a second blank interval on Return to dashboard while profile loaded. Fixed by retaining the native cover across bootstrap, including non-dashboard role fallback. The actual production bootstrap harness reproduced RED then passed; installed Simulator fault injection delayed profile12seconds and returned503, with visible loading then retry controls, followed by successful native dashboard on retry. Expired-session and role fallback transitions are covered in the executable harness.
- Actual assistant controller/native controls: typed exact draft, capabilities dialog open/dismiss preserving draft, Send to intentionally synthetic HTTP409, native screen remained after7-second settling. One accepted context, zero clears/invalid states.
- Native dock routes Rentals, Profile and Calls rendered actual native screens; explicit Customers web destination loaded a clearly labeled synthetic HTML page. This last check proves the retained hybrid handoff, not native Customers.
- Executed extracted real forwarding delegate against WebKit: original start/finish/failure/process callbacks and navigation-policy selector forwarded.
- Production generated Capacitor config restored to https://trashed.app before release. No fixture URLs or auth bypasses are added to Release source.

Evidence under workspace `outputs/ios106-incident/`: recovery-cover-build.log, native-assistant-proof.json, release-ios-ui-events.jsonl, handoff-focused.log, hotfix-final-tests.log, screenshots. All route data and assistant HTTP responses in Simulator were controlled synthetic fixtures; no live model inference/customer writes occurred. Locked Mac prevented physical iPhone Mirroring verification. Do not claim all real-account navigation defects resolved from this matrix.
