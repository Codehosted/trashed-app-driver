# Trashed Driver Mobile Shell

This repository currently ships the Trashed Driver mobile shell. The default Capacitor target remains `com.trashed.driver` / `Trashed Driver` and loads:

```txt
https://trashed.app/driver?source=trashed-driver-app
```

Do not repoint, rename, or reuse the default Driver native `ios/` or `android/` projects for another app profile.

## Trashed Projects profile

This worktree also contains a safe, non-destructive foundation for a future Trashed Projects mobile shell. The Projects profile is separate from the Driver target:

- App ID: `app.trashed.projects`
- App name: `Trashed Projects`
- Config file: `capacitor.projects.config.mjs`
- Metadata: `app-store-assets/projects/`
- Default URL: `https://projects.trashed.app/projects?source=trashed-projects-app`

The Projects environment contract is:

```sh
TRASHED_PROJECTS_WEB_URL=https://projects.trashed.app
```

`TRASHED_PROJECTS_WEB_URL` may be either the origin/root app base (`https://projects.trashed.app`) or an explicit Projects route base (`https://staging.trashed.app/projects`). The config factory normalizes both to one `/projects` path, avoiding accidental `/projects/projects` duplication.

## Safe commands

Use npm scripts in this repo. This is not the bun-only monolith.

```sh
npm install
npm test
npm run driver:config:validate
npm run projects:config:validate
npm run projects:config:print
npm run projects:build
```

`projects:build` validates the Projects profile and runs the Vite build only. It does not run `cap sync`, does not modify `ios/`, and does not modify `android/`.

## Native generation guardrail

The existing native projects under `ios/` and `android/` are Driver artifacts and include Driver-specific location/background-location behavior. The Projects profile must not inherit those permissions. Until a separate native target/workspace is intentionally generated and reviewed, treat `capacitor.projects.config.mjs` as a validated config profile only.

Do not run Capacitor sync for Projects against the existing Driver native directories. A future Projects native-generation workflow should create separate native output paths or a separate repository/worktree, then prove through tests and native manifest inspection that it excludes:

- Android foreground/background location permissions.
- Android foreground service location permission.
- iOS location usage descriptions.
- iOS background location modes.
- Background geolocation plugins.

## Codehosted / PR #508 context

The requested repository name `trashed-app-mobile` currently maps operationally to this Codehosted `trashed-app-driver` worktree. This shell foundation is intended to relate to Codehosted/trashed-app PR #508 without changing the shipped Driver app by default. Any web behavior required by PR #508 should remain on the Trashed web app side; this mobile repo only validates and packages shell configuration.

## Store metadata

Driver store metadata and generated assets remain in `app-store-assets/`.

Projects marketplace metadata lives in `app-store-assets/projects/` and describes the mass-market reuse marketplace for Builders and Supporters: free or up to 50%-retail items, points for value and generosity, and no location permission for this shell unless a later optional pickup-logistics feature adds a separately reviewed permission flow.

No signing credentials are generated here, and no app-store submission is complete from this repository state.

## Local development

Prerequisites: Node.js.

```sh
npm install
npm run dev
```
