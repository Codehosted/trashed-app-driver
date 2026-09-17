# Trashed 1.0.4 update

## Included
- API-backed native vendor dashboard on iOS16+ and Android, with native revenue charts, Month/Year selection, metric cards and inventory breakdown.
- System-following app appearance and removal of explicit native theme menu actions; native view, dialog, status-bar and web theme synchronization without resetting edits.
- Native call transcript conversation screens, retained audio playback and list state.
- Direct native entry/return for supported profile, calls and dashboard destinations.
- Assistant is a primary dock tab, Admin is nested in Account/Profile, and Delete account navigation shortcuts are removed; underlying deletion flow retained.

## Compatibility and scope
Deploy paired `/api/mobile/dashboard` backend before this binary. Recharts remains on the website; native dashboards use Swift Charts and Android Canvas. iOS14/15 retain legacy fallback where native screens require iOS16. This is an incremental native-screen update, **not a completed 100% native migration**: unconverted routes and assistant web-controller dependencies remain.

## Version
Marketing version1.0.4 is consistent in Xcode, TestFlight workflow defaults and upload script. Build numbers remain unique timestamps. Android QA builds identify1.0.4-checkpoint and are debug-signed, not GooglePlay releases.

## Verification before release
Full mobile Node suite, focused native/dashboard lifecycle tests, Xcode Simulator build and Android app unit/build/instrumentation were exercised. Real localPostgres + normalNextlogin dashboard integration passed11cases, with scoped fixtures removed. Runtime theme/dashboard/transcript evidence uses synthetic data; it is not proof of every production route or physical-device notification delivery. See accompanying native dashboard/directnavigation/transcript docs for exact matrices.

## Release boundary
GitHub PRs and remote build receipts are required. Do not claim TestFlight until AppStoreConnect reports the exact build VALID/internaltesting; do not claim public AppStore until approved/publicstate. No Slack announcements without separate approved copy. Android signing/Play access remains a separate gate.
