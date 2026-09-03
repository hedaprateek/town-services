# The two Android apps

One Gradle project, two flavours, one WebView each.

| | **Local Services** | **Society Directory** |
|---|---|---|
| Package | `io.github.hedaprateek.townservices` | `io.github.hedaprateek.societydirectory` |
| Opens | a copy of the site inside the APK | `society-info.hedaprateek.workers.dev` |
| First run offline | works | needs a connection once |
| Data in the file | the public list | **none** |
| Safe to forward | yes | yes — it is only a shortcut |

## Why one bundles and the other does not

An APK is a zip. Anyone it is passed to can open it and read what is inside,
and it will be passed on — that is the whole point of handing it out.

So the town list ships inside its app: it is public by design, and bundling it
means the app opens with no signal the first time someone runs it. The society
directory does not. Its `data.xlsx` is the resident list, and putting that in a
file that travels freely would undo the access-code gate completely. That app
holds nothing but a shortcut; the site asks for a code as usual, and the site's
own service worker keeps it working offline afterwards.

`stage-site.js` names each file that goes into the APK one at a time and then
re-reads the folder to check nothing else arrived. The workflow checks again
after it. `admin.html`, any `.xlsx`, and anything matching `access-codes*`,
`member-codes*` or `code-slips*` fail the build.

## Building

You do not need to. Every push that touches `android/`, `index.html` or
`services.json` builds both APKs and attaches them to a
[Release](https://github.com/hedaprateek/town-services/releases). Send anyone
that link — downloading from it needs no GitHub account.

To run it by hand: **Actions → Android APKs → Run workflow**.

To build locally you need a JDK 17 and the Android SDK, then:

```sh
node android/stage-site.js
node android/make-launcher-icons.js
cd android && gradle assembleRelease
```

## Signing, so updates install over the old app

Without a signing key the workflow uses a throwaway debug key. The APKs install
and run, but each build has a different identity, so build 5 will not install
over build 4 — it has to be uninstalled first, and that loses nothing but is
annoying to explain to a hundred people.

Fix it once. On any machine with a JDK:

```sh
keytool -genkeypair -v -keystore release.jks -alias directory \
  -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password twice and for a name — any of it will do; this key is
not going to a store. Then:

```sh
base64 -w0 release.jks > release.jks.b64      # macOS: base64 -i release.jks
```

In **Settings → Secrets and variables → Actions**, add four secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_B64` | the contents of `release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
| `ANDROID_KEY_ALIAS` | `directory` |
| `ANDROID_KEY_PASSWORD` | the same password |

Keep `release.jks` somewhere safe and out of this repo — `.gitignore` already
refuses `*.jks`. Losing it means the next build cannot install over the apps
people already have.

## What the app adds over the website

Not much on purpose — it is the same page. What it does add:

- a home-screen icon and no browser bar
- the town list opens with no signal, from the very first launch
- new listings arrive on their own; the page reloads once if they changed
- `tel:`, `mailto:` and WhatsApp links hand off to the phone's real apps
- rotating the phone does not reload the page
- the sign-in cookie survives closing the society app

There is no iPhone build, and there cannot be one from a file: iOS installs
apps only through the App Store. On an iPhone the site is added from Safari
with Share → Add to Home Screen, which gives the same icon and the same
full-screen behaviour.
