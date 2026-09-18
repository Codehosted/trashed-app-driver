# Trashed mobile app

Native iOS/Android app (`com.trashed.driver`), Capacitor bridges and store build tooling. The live Next.js application is maintained separately in [Codehosted/trashed-app](https://github.com/Codehosted/trashed-app); native screens and web fallback cooperate at runtime.

## Build and release

See **[Mobile build/release guide and architecture diagram](docs/mobile-build-release.md)** for prerequisites, runtime ownership, signing, artifacts, CI triggers and release safety.

```sh
npm run ios:verify -- --help
npm run ios:verify       # macOS + Xcode + CocoaPods; unsigned Simulator compile, no device interaction
npm run android:verify   # JDK 21 + Android SDK 36; debug APK, no install/upload
npm run mobile:preflight # GET-only production mobile-entry compatibility check
```

Both verification scripts install locked dependencies, test, build and sync the relevant native project. Use a clean worktree: **do not place backend secrets or a Gemini API key in the mobile bundle**.

Release-only commands require explicit authorization and externally supplied credentials:

- `npm run android:release` — signed APK/AAB and checksums; **does not upload** to Google Play.
- `npm run ios:testflight` — **changes signing/keychain state and uploads** to App Store Connect, then verifies TestFlight processing. Not a local-only build command.

Neither command submits store review or publishes a production web deployment. Existing CI may upload iOS automatically on matching `main` pushes; see the guide before merging.

## Legacy local Vite shell

`npm ci && npm run dev` runs the local Vite project. It is not the live Next.js app loaded by the default native configuration. `npm run build` creates `dist`, not a Next.js export or a signed mobile artifact. Edit live web routes/APIs in the separate Next.js repo; edit native screens/plugins and mobile build configuration here.
