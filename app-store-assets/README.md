# Trashed Driver — App Store / Play Store Submission Packet

Updated: 2026-06-12T02:42:18Z

## App listing

### App name
Trashed Driver

### Subtitle / short description
Realtime driver routes and vendor tools for dumpster haulers.

### Full description
Trashed Driver gives dumpster rental teams a mobile-first command center for daily routes, delivery and pickup stops, and vendor operations. Drivers can keep the live route map open, start routes, mark arrival, and share realtime position beacons with dispatch. Vendors can open the full Trashed experience inside secure WebViews for dispatch, rentals, inventory, customers, and settings.

### Key features
- Driver map and route action screen.
- Foreground GPS position beacons for active driver routes.
- Realtime driver tracking fanout through the Trashed web app and SpacetimeDB.
- Vendor dashboard, dispatch, rentals, inventory, customers, and settings WebView tabs.
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

Trashed Driver is intended for authorized dumpster hauler/vendor teams using Trashed. The app includes a native mobile shell for drivers and WebView-based vendor operations. The driver map remains in-app and the vendor experience is loaded through Trashed web routes so vendors get the same dashboard, dispatch, rental, inventory, customer, and settings experience as the web product.

For this local Linux capture pass, no production credentials were used. Vendor WebView screenshots therefore show the Trashed sign-in gate. Authenticated screenshots should be regenerated on an Android device/emulator or Mac/iOS simulator once test vendor credentials are available.

## Privacy and data-safety copy

### Location permission rationale
Trashed Driver requests foreground location access so an active driver route can share realtime position beacons with dispatch/vendor map views. Location is used to display route progress and help dispatch coordinate dumpster deliveries, swaps, and pickups.

### Data collected / processed
- Approximate and precise foreground location while the driver route screen is open and permission is granted.
- Driver route identifiers needed to associate a beacon with a route.
- Device/network data required by the embedded Trashed web experience.

### Data not intended for this build
- No background location permission is declared in the Android manifest.
- No camera permission is declared in the Android manifest.
- No contacts, microphone, calendar, or health data access is declared.

## Permissions currently declared on Android

- `android.permission.INTERNET`
- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`

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
- `artwork/trashed-driver-icon-1024.png` — 1024×1024 PNG
- `artwork/feature-graphic-1024x500.png` — 1024×500 PNG

### Linux preview screenshots
All current screenshots were captured from local Linux browser preview at 1280×577.

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
- Verify Android foreground location permission prompts and GPS beaconing on-device.
- Verify the driver map and vendor dispatch map with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configured in the target environment.
- Background driver tracking is not implemented or permissioned in this build; if required, add a native background-location implementation and stronger store disclosure language.
