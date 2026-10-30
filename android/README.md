<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Mutuvia Android shell

A thin [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) wrapper around one Mutuvia deployment, built with [`androidbrowserhelper`](https://github.com/GoogleChrome/android-browser-helper). It opens `https://<host>/` full-screen in the user's browser; all screens come from the website.

```sh
./gradlew :app:assembleDebug -Pmutuvia.host=mutuvia.example.net
```

Build properties, signing, Digital Asset Links setup, release procedure and troubleshooting are all in [`docs/android.md`](../docs/android.md).
