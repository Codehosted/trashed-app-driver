# Trashed Driver — App Store / Play Store Submission Packet

Updated: 2026-07-19

## App listing

### App name
Trashed Driver

### Android package name
`com.trashed.driver`

### Subtitle / short description
Realtime driver routes and vendor tools for dumpster haulers.

### Full description
Trashed Driver gives dumpster rental teams a mobile-first command center for daily routes, delivery and pickup stops, and vendor operations. Drivers can keep the live route map open, start routes, mark arrival, and share realtime position beacons with dispatch. Vendors can open the full Trashed experience inside secure WebViews for dispatch, rentals, inventory, customers, and settings.

### Key features
- Driver map and route action screen.
- Foreground and background GPS position beacons for active driver routes.
- Realtime driver tracking fanout through the Trashed web app and SpacetimeDB.
- Vendor dashboard, dispatch, AI assistant, rentals, inventory, customers, and settings WebView routes.
- Capacitor Android shell around the Trashed web app.
- Local-first configuration for development and preview.

### Keywords
`dumpster rental, waste management, driver routes, dispatch, hauling, roll off, logistics, fleet tracking, rental management`

### Category
- Primary: Business
- Secondary: Productivity

### Support URL
https://trashed.app/support

### Marketing URL
https://trashed.app

### Privacy Policy
https://trashed.app/privacy

## Store review notes

Trashed Driver is intended for authorized dumpster hauler/vendor teams using Trashed. The app includes a native mobile shell for drivers and WebView-based vendor operations. The driver map remains in-app and the vendor experience is loaded through Trashed web routes so vendors get the same dashboard, dispatch, rental, inventory, customer, and settings experience as the web product, including the vendor AI assistant when the vendor account has AI access enabled.

A dedicated, non-privileged Google Play reviewer account is configured in an isolated synthetic vendor tenant. Its password is stored in macOS Keychain under service `com.codehosted.trashed-driver.play-reviewer`; it is never stored in this repository. The reviewer fixture provides a fresh daily three-stop route through 2026-10-17, three dispatch messages, and three route photos for every first stop.

Reviewer username: `play-reviewer@codehosted.com`

Google Play instructions:

> Open Trashed Driver. Under OR SIGN IN WITH EMAIL, enter the username and password above; tap Sign In. Do not use Google. Allow notifications. The account opens a synthetic route. Open the route list to select a stop. Tap chat for messages. Tap a stop, then camera, for saved photos. For background location, tap Go Online, review the disclosure, tap Continue, and allow precise location. Android shows a persistent tracking notification. Tap Go Offline to stop. No OTP or payment is required.

## Privacy and data-safety copy

### Location permission rationale
Trashed Driver requests precise location access so a user-initiated active driver route can continue sharing realtime position beacons with dispatch/vendor map views when the driver switches apps, locks the device, or leaves the app in the background. Location is used to display route progress and help dispatch coordinate dumpster deliveries, swaps, and pickups. Tracking starts only for an active route and continues in a location foreground service with a persistent Android notification while tracking is running. The app does not request Android's separate background-location permission.

### Data collected / processed
- Approximate and precise location while a user-initiated driver route is active and permission is granted, including while the app is backgrounded under the location foreground service.
- Driver route identifiers needed to associate a beacon with a route.
- Device/network data required by the embedded Trashed web experience.
- Notifications used for active route/background tracking status and app alerts when enabled.

### Data not intended for this build
- No camera permission is declared in the Android manifest.
- No contacts, microphone, calendar, or health data access is declared by the Android shell. The authenticated web vendor AI assistant may request browser microphone access only if that web feature is opened and the user grants it.

## Permissions currently declared on Android

- `android.permission.INTERNET`
- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.FOREGROUND_SERVICE`
- `android.permission.FOREGROUND_SERVICE_LOCATION`
- `android.permission.POST_NOTIFICATIONS`

## Realtime verification status

SpacetimeDB publish is complete for `trashed-call-center-grjph` on `maincloud`.

Verified hosted schema includes:
- `driver_position`
- `upsert_driver_position`
- `delete_driver_position`

Local end-to-end smoke passed against `http://127.0.0.1:3007` with route `e8acabb8-de5c-4f4b-87e1-fed9d3d62918`:

```txt
POST /api/vendor/driver/tracking -> 200 { ok: true, realtime: { ok: true } }
GET /api/vendor/driver/tracking?routeUuid=... -> 200 { ok: true, positions: [...] }
```

## Assets generated

### Artwork
- `artwork/trashed-driver-icon.svg`
- `artwork/play-store-icon-512.png` — 512×512 PNG for Google Play
- `artwork/trashed-driver-icon-1024.png` — 1024×1024 source PNG
- `artwork/feature-graphic-1024x500.png` — 1024×500 PNG

### Google Play phone screenshots
The current `play-phone-*` set is built from authenticated 1080×1920 Pixel 2 captures. Exact UI pixels are preserved inside a deterministic product frame. Nano Banana 2 (`gemini-3.1-flash-image`) generated only the abstract background and synthetic route-photo content, so it could not alter interface text, maps, icons, or controls.

- `screenshots/play-phone-01-driver-routes.png` — three-stop daily route.
- `screenshots/play-phone-02-dispatch-messages.png` — driver/dispatch conversation.
- `screenshots/play-phone-03-customer-details.png` — synthetic customer route card.
- `screenshots/play-phone-04-route-photos.png` — three artifact-checked route photos.

All four files are 1080×1920 RGB PNGs with no alpha channel. Source captures are intentionally kept under the ignored `build/play-review-capture/` directory rather than committed.

Legacy local browser captures:

- `screenshots/01-driver-home.png`
- `screenshots/02-driver-route-started.png`
- `screenshots/03-vendor-dashboard-webview.png`
- `screenshots/04-vendor-dispatch-webview.png`
- `screenshots/05-vendor-rentals-webview.png`
- `screenshots/06-vendor-inventory-webview.png`
- `screenshots/07-vendor-customers-webview.png`
- `screenshots/08-vendor-settings-webview.png`

## Verified release state

- Signed Android App Bundle `1.0.1 (2)` is active on Google Play internal testing.
- Google Play app-signing SHA-1 and SHA-256 certificates are registered with Firebase.
- Android precise-location disclosure and the persistent location foreground service were verified on a physical Pixel 2 while the screen was off.
- A real FCM notification was delivered to the physical device while it was dozing.
- The isolated reviewer password login, current route, messages, customer detail, and saved photos were verified against production.

## Local validation

```sh
python3 scripts/validate-play-store-assets.py
```
