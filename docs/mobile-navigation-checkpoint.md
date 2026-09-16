# Mobile navigation checkpoint

Work in progress; not ready to release. This checkpoint was pushed at the owner's request to preserve progress and stop further work.

## Implemented
- Native iOS/Android bottom bars and sheets, fed by the web app's existing permission-filtered navigation.
- Shared web bottom drawer fallback for older binaries.
- Vendor/driver adapters, opaque action IDs, acknowledgment-gated fallback, scoped reset/cleanup, and no native route prefetch.
- Regression fixes for invalid dashboard payload, late acknowledgments after timeout, empty-state recovery, and HTTP development contexts.

## Evidence
- Current focused web suite: 209/209 passed, including bridge regression tests.
- Android: 17/17 focused Node tests, 9/9 JVM tests; debug app and instrumentation APK assembled. Instrumentation not executed.
- iOS: 33/33 focused tests; simulator SDK typecheck passed. Physical build compiled/linked but signing failed with errSecInternalComponent. No installable signed app and no physical workflow proof.
- Earlier shared-only typecheck passed; final cross-repository typecheck/build/runtime gates remain required for current integrated code.

## Resume here
1. Resolve existing iOS signing-key access without creating/revoking credentials; build and install the exact candidate.
2. Finish independent protocol review, full type/build gates, and physical iPhone screenshots/interaction tests; Android runtime tests remain.
3. Production smoke is authorized only under George Test with verified Stripe test-mode payments and fictional contacts. Verify the actual production identity/vendor/driver and existing swap station before mutations.
4. Fix production test-order outbound isolation first: request-scoped capture does not currently cover delayed escalation and driver notifications. Local Mailpit configuration cannot redirect deployed production workers. Current production identity and station reads were not verified. No test orders, payments, communications or driver-position updates have been performed.
5. Then verify two-customer/swap-station assignment, photo/note updates, clearly labeled simulated travel, push delivery/tap behavior and persistence. Keep real customer data, contacts and live drivers unaffected.
6. Complete remaining store artwork/name/privacy/reviewer requirements, create fresh release builds, submit and verify publication. Existing store candidates predate native drawer changes.

Related repositories: Codehosted/trashed-app and Codehosted/trashed-app-driver. Do not merge or publish based solely on this checkpoint.
