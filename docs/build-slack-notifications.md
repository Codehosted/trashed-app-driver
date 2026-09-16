# Platform build notifications

The native CI workflows route build results to the existing **Trash Evolved - Trashed App** Slack workspace:

| Platform | Channel | Repository variable |
|---|---|---|
| iOS | `#mobile-app-ios` | `SLACK_MOBILE_APP_IOS_CHANNEL_ID` |
| Android | `#mobile-app-android` | `SLACK_MOBILE_APP_ANDROID_CHANNEL_ID` |

`SLACK_MOBILE_BUILD_BOT_TOKEN` is an encrypted GitHub Actions secret. Never commit its value. The existing Trashed bot must be a member and have posting plus channel-history access for read-back verification.

## Approval / enablement

Set the repository variable `SLACK_APP_UPDATES_ENABLED=true` only after the exact channels and template are approved. Any other value disables all sends. The initial configuration leaves this `false`; the approval prompt expired. Builds themselves remain runnable.

Template (dynamic fields filled from the actual GitHub run):

> Trashed {iOS/Android} build {success/failure/cancelled/skipped}
> Version {version} · Build {build}
> Branch: {branch} · Commit: {short SHA}
> {Verified TestFlight readiness / Android QA artifact availability / no availability assertion on failure}
> CI: {run link}
> Test build only; not a production-store release.

No broad mentions, secrets, customer data, or logs are posted. Branch text is escaped. Rerunning a run updates the matching platform message, using run/platform metadata, instead of creating another announcement. A send/update is read back from the exact channel/timestamp; an unverified delivery fails the notification job and retains its diagnostic in CI.

## Workflow events

- `testflight.yml`: the iOS notice runs only after archive/upload/**TestFlight processing verification** finishes. Main-branch native pushes and explicit workflow dispatches are covered.
- An explicit TestFlight workflow dispatch also invokes `android-checkpoint.yml` on the same branch commit. Its Android notice follows APK/test APK packaging and artifact upload.
- Standalone Android checkpoint dispatches use the same notifier.
- These are build/update notifications, **not App Store/Google Play publication notices**. A future production-store release pipeline should use a separately approved publication template after provider read-back.

Tests: `node --test tests/build-slack-notifications.test.mjs`. The tests use mocked Slack transport and never send.
