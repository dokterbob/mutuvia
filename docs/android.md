# Android app

Mutuvia ships an Android app under `android/`. It is a thin shell around the web app: it opens your deployment full-screen in Chrome (a Trusted Web Activity). Signed APKs are published on GitHub Releases.

## Overview

The app is a **Trusted Web Activity (TWA)**, not a WebView wrapper. A TWA renders your site in the user's installed Chrome, without a URL bar, once Chrome has verified (via Digital Asset Links) that the app and the website belong together. Because it is real Chrome, everything the PWA already does keeps working unchanged:

- Web Push through `PushManager` (the service worker keeps running in the background)
- the camera QR scanner (`getUserMedia`)
- `navigator.share`, cookies, the service worker and the offline page

A plain WebView would lose Web Push and service workers. If no TWA-capable browser is installed, the shell falls back to a WebView (`FALLBACK_STRATEGY=webview`) with reduced features: **no Web Push and no service worker**. The shell overrides `getCustomTabsCallback()` in `MutuviaLauncherActivity` so that the library's `QualityEnforcer` does not crash the app when Chrome reports a 404 or an offline navigation.

## Architecture

One Gradle module (`app`) with a single Kotlin class: `MutuviaLauncherActivity` extends the androidbrowserhelper `LauncherActivity` and launches `https://<host>/`. Everything deployment-specific (host, name, application id, version) is injected at build time through Gradle properties, so one source tree serves any community.

The web side only has to serve `/.well-known/assetlinks.json`, implemented in `src/routes/.well-known/assetlinks.json/+server.ts`.

## Updates

- **Web content** updates through the normal service worker flow. Deploy the server and users get the new version; there is nothing to do on the Android side.
- **The APK is a thin shell** and only needs rebuilding when the shell itself changes (new Chrome helper library version, icon, host). Users then download the new `mutuvia-vX.Y.Z.apk` from GitHub Releases and install it over the existing app.
- **Same-signer rule:** Android only installs an update signed with the same key as the installed app, so releases must always use the same keystore. See [key custody](#release-and-signing).

## Per-deployment setup

Do this once for each deployment (each community has its own host).

1. Set `APP_URL` to `https://<host>`, the same host as `mutuvia.host` in the app, so shared `/accept/…` and `/send/…` links match the app's intent filter.
2. Set the two Android variables (see the README environment table):
   - `ANDROID_PACKAGE_NAME` - the app's `applicationId` (default `org.mutuvia.app`)
   - `ANDROID_SHA256_FINGERPRINTS` - comma-separated SHA-256 fingerprints of the signing certificate(s), e.g. the release key and, while testing, the debug key
3. Check that the file is served correctly (must be `200`, `Content-Type: application/json`, no redirect):

   ```bash
   curl -i https://<host>/.well-known/assetlinks.json
   ```

4. Ask Google whether it sees the relationship:

   ```
   https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<host>&relation=delegate_permission/common.handle_all_urls
   ```

5. After installing the app on a device, check Android's own verification:

   ```bash
   adb shell pm get-app-links org.mutuvia.app            # expect "<host>: verified"
   adb shell pm verify-app-links --re-verify org.mutuvia.app
   ```

Adjust the package name if you changed `mutuvia.applicationId`.

## Building locally

Use Android Studio (open the `android/` directory) or the Gradle wrapper. JDK 17+ and the Android SDK (platform 36) are required.

```bash
cd android
./gradlew :app:lintDebug :app:assembleDebug -Pmutuvia.host=mutuvia.example.org
# APK: app/build/outputs/apk/debug/app-debug.apk
```

CI runs exactly `./gradlew --no-daemon :app:lintDebug :app:assembleDebug :app:assembleRelease -Pmutuvia.host=ci.invalid` (JDK 21); running the same command locally is the quickest way to reproduce a CI failure. A local `ANDROID_HOME` pointing at an SDK with `platforms;android-36` and `build-tools` is enough (Android Studio not required); it also builds with newer JDKs such as 26.

To install on a device or emulator with USB debugging enabled:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

To dry-run release signing locally, create a throwaway keystore and point the signing variables at it (never reuse the real release key for this):

```bash
keytool -genkeypair -v -keystore /tmp/test.keystore -alias test -keyalg RSA -keysize 2048 -validity 30 -storepass testpass -keypass testpass -dname "CN=test"
MUTUVIA_KEYSTORE_PATH=/tmp/test.keystore MUTUVIA_KEYSTORE_PASSWORD=testpass MUTUVIA_KEY_ALIAS=test MUTUVIA_KEY_PASSWORD=testpass \
  ./gradlew :app:assembleRelease -Pmutuvia.host=mutuvia.example.net
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

Release tasks (`assembleRelease`) refuse the placeholder host `mutuvia.example.org`. Signing reads `MUTUVIA_KEYSTORE_PATH`, `MUTUVIA_KEYSTORE_PASSWORD`, `MUTUVIA_KEY_ALIAS` and `MUTUVIA_KEY_PASSWORD` from the environment and is skipped (unsigned APK) when the path is unset.

Settable with `-P` or in `android/gradle.properties`:

| Property                | Default               | Meaning                                                     |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| `mutuvia.host`          | `mutuvia.example.org` | Bare hostname of the deployment (required for real builds). |
| `mutuvia.applicationId` | `org.mutuvia.app`     | Android application id.                                     |
| `mutuvia.appName`       | `Mutuvia`             | Launcher label.                                             |

Locally built debug APKs are signed with your `~/.android/debug.keystore`. Add its fingerprint to `ANDROID_SHA256_FINGERPRINTS` to test a debug build against your deployment (CI debug builds use a throwaway key and cannot verify):

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256
```

## Release and signing

### One-time setup

Create the release keystore (keep the passwords somewhere safe):

```bash
keytool -genkeypair -v -keystore release.keystore -alias mutuvia -keyalg RSA -keysize 4096 -validity 10000
```

Add these GitHub Actions secrets and variable (Settings > Secrets and variables > Actions):

| Name                        | Kind     | Value                                           |
| --------------------------- | -------- | ----------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | secret   | `base64 -w0 release.keystore`                   |
| `ANDROID_KEYSTORE_PASSWORD` | secret   | Keystore password                               |
| `ANDROID_KEY_ALIAS`         | secret   | `mutuvia` (the alias used above)                |
| `ANDROID_KEY_PASSWORD`      | secret   | Key password                                    |
| `MUTUVIA_HOST`              | variable | Deployment hostname, e.g. `mutuvia.example.org` |

> **Key custody warning.** The release keystore is the identity of your app. Android refuses to update an installed app with an APK signed by a different key, so **if you lose the keystore (or its passwords), every existing install can never be updated** and users must uninstall and reinstall. Back up `release.keystore` and its passwords outside GitHub (password manager, offline copy). GitHub secrets cannot be read back.

### Releasing

1. Bump `version` in `package.json` and add the `## [X.Y.Z]` section to `CHANGELOG.md`.
2. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The `Android` workflow checks that the tag equals the `package.json` version, builds and signs the release APK, verifies the signature, and attaches `mutuvia-vX.Y.Z.apk` and `mutuvia-vX.Y.Z.apk.sha256` to the GitHub Release for the tag, creating the release (without notes) if none exists yet. Tags containing `-` are marked pre-release. The release is created as a draft, the assets are attached, and only then is it published, because this repository uses immutable releases (assets cannot be added after publishing, and a published tag name can never be reused). So a failed run leaves a draft to delete, and the tag can be pushed again; but never create the release by hand, publish it first, and then tag.

`versionCode` is derived as `MAJOR*10000 + MINOR*100 + PATCH` (a pre-release suffix is ignored), so keep minor and patch below 100.

### First release

The job summary of the release run prints the signing certificate's SHA-256 digest in colon-separated form. Copy it into `ANDROID_SHA256_FINGERPRINTS` on the web deployment and redeploy, then verify with the `curl` check above. Until then the app opens with a URL bar instead of full-screen.

## Manual test checklist

Run on a real device with Chrome installed, against a deployment with assetlinks configured.

- [ ] Install the debug APK (fingerprint of the debug key in `ANDROID_SHA256_FINGERPRINTS`). It opens full-screen **without a URL bar**. If a URL bar shows, asset-link verification failed: compare the debug and release fingerprints.
- [ ] Log in with an OTP code (SMS or email).
- [ ] Scan a QR code with the in-app camera scanner.
- [ ] Create a payment request, background the app, scan the request from another phone, and receive the push notification.
- [ ] Share a QR link to another app, tap it there: it opens in Mutuvia, not in the browser.
- [ ] Enable airplane mode and launch the app: the offline page appears, no crash.

## Known limitations

- **Web Share Target.** The `share_target` entry in the web manifest does not work from the TWA; sharing _out_ (`navigator.share`) works.
- **SSE and backgrounding.** The SSE stream drops when the app is backgrounded; Web Push covers notifications in that case.
- **No Chrome, no push, no camera.** Without a TWA-capable browser the WebView fallback is used, with no Web Push, no service worker and no camera access (the library's fallback does not grant `getUserMedia`), so QR scanning only works in TWA mode.
- **Icons.** API 26+ uses the adaptive icon (vector foreground from `static/favicon.svg` on the brand colour); API 24 and 25 use the PNGs under `res/mipmap-*`, which are rendered from the same geometry.
- **Android developer verification.** Google is phasing in a requirement (regional in 2026, global in 2027) that sideloaded apps come from registered developers; check Google's current rules before relying on GitHub-hosted APKs.
- **Google Play is not set up.** Distribution is via GitHub Releases only. The same project could produce an AAB for a Play upload later.
- **One APK per community.** The host, name and signing key are baked in. To ship your own app, fork the build with your own key and `mutuvia.*` properties; APKs signed with different keys cannot update each other.

## Troubleshooting

| Symptom                                        | Likely cause and fix                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL bar visible at the top                     | Digital Asset Links not verified. Check `curl -i .../assetlinks.json`, the fingerprint (debug vs release), package name, and the Google statements URL. |
| `pm get-app-links` shows `none` or `1024`      | Re-run `adb shell pm verify-app-links --re-verify org.mutuvia.app`; ensure the device can reach the host over HTTPS.                                    |
| assetlinks returns 404                         | `ANDROID_SHA256_FINGERPRINTS` is empty on the server.                                                                                                   |
| App opens in a Custom Tab, not full-screen     | Chrome is not the default browser and not system-installed, or verification failed. Set Chrome as default and retry.                                    |
| Install fails with "incompatible" / "conflict" | The new APK is signed with a different key than the installed one. Use the original keystore, or uninstall first (loses local data).                    |
| "Install unknown apps" prompt every time       | Enable the toggle for Mutuvia in system settings.                                                                                                       |
| Release job fails: secret or variable empty    | Add `ANDROID_KEYSTORE_BASE64` and `MUTUVIA_HOST` as described above.                                                                                    |
| Release job fails: tag mismatch                | The tag must equal `package.json` `version` (`v` prefix aside).                                                                                         |
