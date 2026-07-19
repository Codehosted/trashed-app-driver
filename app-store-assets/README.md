# Trashed Driver — App Store / Play Store Submission Packet

Updated: 2026-07-04

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

For the existing local browser capture pass, no production credentials were used. Vendor WebView screenshots therefore show the Trashed sign-in gate. Authenticated screenshots should be regenerated on an Android device/emulator or Mac/iOS simulator once test vendor credentials are available.

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

### Preview screenshots
The `play-phone-*` screenshots are 1080×1920 PNGs that meet Google Play phone screenshot size/aspect constraints. They should be replaced with authenticated on-device captures before public launch so dispatch and assistant content are not just the sign-in gate.

- `screenshots/play-phone-01-driver-dispatch.png`
- `screenshots/play-phone-02-vendor-dispatch.png`
- `screenshots/play-phone-03-vendor-ai-assistant.png`
- `screenshots/play-phone-04-vendor-dashboard.png`

Legacy local browser captures:

- `screenshots/01-driver-home.png`
- `screenshots/02-driver-route-started.png`
- `screenshots/03-vendor-dashboard-webview.png`
- `screenshots/04-vendor-dispatch-webview.png`
- `screenshots/05-vendor-rentals-webview.png`
- `screenshots/06-vendor-inventory-webview.png`
- `screenshots/07-vendor-customers-webview.png`
- `screenshots/08-vendor-settings-webview.png`

## Release caveats before public store submission

- Regenerate official store screenshots from a real Android emulator/device and, later, iOS simulator/device on the Mac.
- Capture authenticated vendor WebView pages with test vendor credentials instead of the login gate.
- Verify Android precise-location prompt, prominent background-use disclosure, persistent foreground-service notification, and GPS beaconing on-device while the app is backgrounded.
- Verify the driver map, vendor dispatch map, and vendor AI assistant routes with an authenticated vendor account that has AI access enabled.
- Verify the driver map and vendor dispatch map with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configured in the target environment.
- Build the final Play upload AAB with the production upload signing key before submission; local unsigned release bundles are not enough for Play Console upload.

## Local validation

```sh
python3 scripts/validate-play-store-assets.py
```
