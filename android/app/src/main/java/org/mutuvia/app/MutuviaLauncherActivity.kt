// SPDX-License-Identifier: AGPL-3.0-or-later

package org.mutuvia.app

import androidx.browser.customtabs.CustomTabsCallback
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * Entry point of the app: opens the Mutuvia deployment configured at build
 * time (`mutuvia.host`) in a Trusted Web Activity, or in the library's WebView
 * fallback when no TWA-capable browser is installed. All behaviour comes from
 * the manifest meta-data on this activity.
 */
class MutuviaLauncherActivity : LauncherActivity() {
    /**
     * The library's default callback is `QualityEnforcer`, which deliberately
     * crashes the app when the browser reports a quality violation inside the
     * verified origin (an HTTP 404, or a navigation while offline). The web app
     * has its own offline page and error screens, so a crash would only hurt
     * users on a flaky connection; a plain callback opts out of enforcement.
     */
    override fun getCustomTabsCallback(): CustomTabsCallback = CustomTabsCallback()
}
