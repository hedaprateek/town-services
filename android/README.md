# Directory Android launchers

Both apps open the protected website in the system browser. Google sign-in does
not run in an embedded WebView. Neither APK includes contacts, workbooks or tokens.
Internet access and approval by an administrator are required.

| App | Package | Target path |
|---|---|---|
| Local Services | `io.github.hedaprateek.townservices` | `/town/` |
| Society Directory | `io.github.hedaprateek.societydirectory` | `/society/` |

The target host in `app/build.gradle` is
`community-directory.hedaprateek.workers.dev`. Confirm the deployed hostname and
complete live Google sign-in checks before distributing updated APKs. Old APKs
may retain their previously bundled public town list; they cannot be recalled.

`node android/stage-site.js` verifies and empties the old generated asset folder.
It stages no contact files. `node android/make-launcher-icons.js` generates icons.

## Build

Use JDK 17, Android SDK 34 and Gradle 8.10:

```text
node android/stage-site.js
node android/make-launcher-icons.js
cd android
gradle assembleRelease
```

The Android APKs GitHub workflow builds both flavors and attaches them to a
release. The protected-directory checks build both APKs without publishing them.

For updates to install over existing apps, retain the existing signing key. The
release workflow accepts repository secrets `ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Without these it produces a temporary debug-signed test build; later builds may
require uninstalling the previous one. Never commit keystores or their passwords.

On iPhone, use the website in Safari and Add to Home Screen.
