# iOS App Review fixes — September 10, 2026

Submission: `99c0992e-ec20-432a-9385-26159c16e9b8`  
Rejected version: `1.0.2 (2026080801)`  
Device test build: `1.0.2 (2026091001)`, Debug, installed on George's iPhone 17 Pro Max running iOS 26.6.1.

## Implemented

- Added native **Continue with Apple** beside Google, using Apple's standard button and email privacy scope. Google and email/password remain available. This follows [Apple's login-service requirement](https://developer.apple.com/app-store/review/guidelines/#login-services).
- Added an Apple token-exchange endpoint in the paired `trashed-app` repository. It verifies Apple's RSA signature, issuer, audience, expiry, issuance time, and hashed nonce. It stores the Apple subject, not identity tokens or private-relay email addresses.
- First Apple login requires explicit, cancellable linking with an existing Trashed account's password. No new employee account, role, or vendor membership is created. Linking locks the user row, rechecks credential validity, and cannot reassign another user's Apple account.
- Expired web sessions and sign-out return to the same native login options rather than falling back to the website's Google-only login.
- Added camera and photo-library purpose strings. These were absent from the native app. [Apple documents that camera access without its purpose string terminates the app](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CocoaKeys.html#//apple_ref/doc/uid/TP40009251-SW24).
- Added release gates for the deployed Apple endpoint, the archived camera/photo privacy strings, and the signed Apple entitlement. CI renews this app's named App Store profile using the existing distribution certificate, validates its capabilities, and waits for the exact uploaded build to finish TestFlight processing without submitting it or notifying testers.

## Verified

- 34 iOS/mobile contract checks passed.
- 28 backend Apple-auth checks passed, including real signed JWT verification and mocked account-linking race/revocation cases.
- Backend TypeScript check passed. A full local Next.js production-mode build also passed (373 static pages); no migrations or production database writes were performed. One existing file-tracing warning remains for the unrelated assistant-upload route.
- iOS Debug build succeeded, signature verified, and the app installed and launched on the physical iPhone.
- Both the signed app and its development provisioning profile contain `com.apple.developer.applesignin = [Default]`. The profile includes this iPhone.
- The built plist contains both camera and photo-library descriptions.
- A physical-device screenshot confirms Apple, Google, and email/password login are visible together.

### Simulator follow-up

After George disconnected the phone, testing continued on the iPhone 17 Pro Max simulator with iOS 26.5 (not the review device's iOS 26.6).

- Simulator build and installation passed. Use normal Xcode simulator signing, not `CODE_SIGNING_ALLOWED=NO`: Xcode embeds the Apple capability in `App.app-Simulated.xcent` / the executable's simulated-entitlement section. The ordinary simulator codesign entitlement payload is empty by design; the simulated payload contains the Apple capability and app identifier.
- An isolated driver signs in through the native email form and loads one current-day route with three synthetic stops.
- Invalid credentials show a recoverable error. Invalidating this test account's previous session and relaunching returns to the native login with Apple, Google, and email options.
- Add Photo → Take Photo opens the native camera screen without terminating the app. Cancelling returns to the empty stop-photo dialog. The same app process remained alive. Simulator logs explain that the viewfinder is unavailable and the shutter is disabled; actual image capture is **not** verified.
- Photo Library opens the system's private-selection picker. Selecting a built-in simulator sample photo and cancelling returns safely; no image was uploaded or persisted.
- With simulator signing enabled, Continue with Apple reaches Apple's **Sign in to your Apple Account** prompt. The simulator has no Apple Account. Closing the prompt restores usable email login, with an error notice. Apple token issuance, Hide My Email, and account linking still require an Apple Account and are not marked passed.
- 31 scoped iOS/mobile checks passed again. Screenshot and app-only log evidence is in the same ignored evidence directory.

Local evidence is in the ignored directory `/Users/georgebyers/GitHub/trashed-app-mobile/artifacts/app-review-20260910/`.

## Current device test environment

The first device install used the default production origin. After George clarified the expected setup, the iOS shell was rebuilt, reinstalled, and launched with `TRASHED_WEB_URL=https://preview.trashed.app`. The bundled `server.url` and `allowNavigation` both target preview; the release default remains production.

- **Web app:** production-mode Next.js on `127.0.0.1:3000`, through the existing `preview.trashed.app` Cloudflare tunnel.
- **Database:** simulator testing now uses the disposable local `trashed_ios_review_20260910` database. Its schema was copied without data from `trashed-app`, then the existing `0148_password_reset_cooldown.sql` column addition was applied only to the disposable database. It contains one test vendor, a driver, three synthetic customer accounts, one route, and three stops. The original local database and production assignments were not changed.
- **Backend readiness:** both localhost and preview return HTTP 200 with the expected Apple provider, app audience, protocol version, and `configured: true`. This proves preview availability, not completed Apple authentication.
- **Safety:** local process uses development application settings within a production-mode build. Email targets Mailpit; SMS, Slack, push, hosted Blob, and payment credentials are disabled for this process. No production migrations, messages, charges, or assignment changes occurred.
- **Run evidence:** `local-preview-build.log`, `local-preview-launchd.log`, `simulator-signed-build.log`, `simulator-photo-test.log`, `simulator-contract-tests.log`, and `simulator-*.png` in the ignored evidence directory. The local server runs as the user-level job `com.codehosted.trashed.ios-preview`, so it survives the task's command session. Stop it with `launchctl remove com.codehosted.trashed.ios-preview` when testing is finished.

## Still required before resubmission

1. **Deploy the backend change safely.** [Backend PR #584](https://github.com/Codehosted/trashed-app/pull/584) isolates the endpoint and its tests on the current production base; its auth-hardening dependencies are now merged. Generic OPTIONS requests return 204 even for nonexistent routes, so the release gate checks a recognizable GET JSON response instead. Deployment and production verification remain release gates, not conclusions from the local tests.
2. **Refresh App Store provisioning.** The old distribution profile lacks the Apple sign-in entitlement. CI now renews this app's exact named profile and verifies Apple sign-in, production APNs, identifier, distribution type, and expiry before archiving. A successful signed Release archive remains the proof.
3. **Physical camera testing is explicitly skipped for this release at George's request.** Simulator camera opening/cancellation and library selection/cancellation passed, but real camera permission prompts, denied camera access, actual capture/preview, and successful persistence remain unverified. Do not report these as passed to App Review.
4. **Complete Apple login end-to-end against preview, then the safely deployed backend.** Test Hide My Email, initial account linking, subsequent Apple-only sign-in, cancellation, invalid credentials, and logout/expired-session recovery. Automated tests and a visible button are not proof of live Apple authentication.
5. **Inspect Apple's original crash report.** The pasted rejection did not include its attachment. The missing camera description is a confirmed fatal configuration defect, but the original review crash has not been symbolicated or matched to a termination reason.
6. **Build and verify a new Release archive.** George authorized merging after feedback, deploying the backend, and updating TestFlight. Use a fresh build number and verify processing; Debug device/simulator builds are not an App Store release candidate. App Store resubmission and approval are separate from TestFlight upload.

## Local build-tool note

Xcode 26.6 stalled while probing Clang: its reader waited for stdout to close while Clang blocked writing verbose stderr. A local, ignored compiler wrapper forwarded the unchanged probe output in stdout-then-stderr order and closed stdout before forwarding stderr. Actual compilation still used Apple's compiler. The wrapper is not an app source change and is not part of CI. The successful build log is `device-build-ordered-pipes.log` in the evidence directory. A normal Release build remains a separate gate.
