# Trashed Driver foreground-service declaration storyboard

Output uses only existing actual Android screenshots and the supplied ADB recording.
No taps, permission dialogs, UI states, credentials, or reviewer activity were fabricated.
When no interaction recording exists, the burned-in caption neutrally explains what that control does.

| Scene | Time | Source | Evidence shown |
|---|---:|---|---|
| 01 SIGN IN | 00:00.0–00:03.0 | `build/android-device-smoke/05-native-google-login.png` | Use the reviewer email and password supplied in Play Console. No credentials are shown here. |
| 02 ASSIGNED ROUTE + DRIVER AVATAR | 00:03.0–00:07.0 | `build/android-device-light-routes-2026-07-19.png` | The authenticated driver sees assigned stops on the route map. The profile avatar identifies the driver. |
| 03 EXPLICIT GO ONLINE CONTROL | 00:07.0–00:10.5 | `build/play-review-capture/reviewer-home.png` | Location sharing starts only when the driver chooses the online control. Red indicates the offline state. |
| 04 BACKGROUND-LOCATION DISCLOSURE | 00:10.5–00:15.5 | `build/android-device-smoke/21-production-push-build.png` | The app explains background use before requesting permission. Continue opens Android's location permission flow. |
| 05 ONLINE — FOREGROUND SERVICE ACTIVE | 00:15.5–00:19.0 | `build/android-device-smoke/22-location-online.png` | Green indicates the driver is online and sharing live route location with dispatch. |
| 06 BACKGROUND / LOCKED DEVICE | 00:19.0–00:25.0 | `/tmp/trashed-fgs-lockscreen.mp4` | Android keeps a visible foreground notification: “Trashed Driver route tracking.” |
| 07 GO OFFLINE STOPS TRACKING | 00:25.0–00:29.0 | `build/play-review-capture/reviewer-home.png` | Go Offline stops foreground location sharing and removes the persistent notification. Red is the offline state. |

Planned duration: 29.0 seconds.

Claim boundary: the actual system permission dialog was not available in the existing captures. The video therefore says only that Continue opens Android’s permission flow; it does not display or simulate that dialog.
