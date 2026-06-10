# Trashed Driver — App Store / Play Store Submission Notes

## App name
Trashed Driver

## Subtitle / short description
Realtime driver routes and vendor tools for dumpster haulers.

## Full description
Trashed Driver gives dumpster rental teams a mobile-first command center for daily routes, delivery and pickup stops, and vendor operations. Drivers can keep the live route map open, start routes, mark arrival, and share realtime position beacons with dispatch. Vendors can open the full Trashed experience inside secure WebViews for dispatch, rentals, inventory, customers, and settings.

## Key features
- Driver map and route action screen
- Realtime location beacon API with SpacetimeDB fanout support
- Vendor dashboard, dispatch, rentals, inventory, customers, and settings WebView tabs
- Capacitor Android shell around the Trashed web app
- Local-first configuration for development and preview

## Keywords
dumpster rental, waste management, driver routes, dispatch, hauling, roll off, logistics, fleet tracking, rental management

## Support URL
https://trashed.app/support

## Marketing URL
https://trashed.app

## Privacy Policy
https://trashed.app/privacy

## Suggested category
Business / Productivity

## Assets generated
- artwork/trashed-driver-icon-1024.png
- artwork/trashed-driver-icon.svg
- artwork/feature-graphic-1024x500.png
- screenshots/01-driver-home.png
- screenshots/02-driver-route-started.png
- screenshots/03-vendor-dashboard-webview.png
- screenshots/04-vendor-dispatch-webview.png
- screenshots/05-vendor-rentals-webview.png
- screenshots/06-vendor-inventory-webview.png
- screenshots/07-vendor-customers-webview.png
- screenshots/08-vendor-settings-webview.png

## Current review caveats
- Screenshots were captured from local Linux browser preview, not from a real Android emulator/device.
- Vendor WebView tabs currently show the Trashed login gate because no local app credentials were used.
- Native Android debug build requires an Android SDK. Java was available only through Docker in this session; SDK was not installed locally.
- Image-generation provider was unavailable, so artwork was generated locally with deterministic vector/PIL drawing.
