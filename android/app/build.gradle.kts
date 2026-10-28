// SPDX-License-Identifier: AGPL-3.0-or-later

// AGP 9 compiles Kotlin itself (built-in Kotlin): no kotlin plugin here.
plugins {
    id("com.android.application")
}

// --- Per-deployment configuration (override with -P<name>=<value>) ----------

val placeholderHost = "mutuvia.example.org"

fun property(name: String, default: String): String =
    providers.gradleProperty(name).orNull?.trim()?.takeIf { it.isNotEmpty() } ?: default

val mutuviaHost = property("mutuvia.host", placeholderHost)
val mutuviaApplicationId = property("mutuvia.applicationId", "org.mutuvia.app")
val mutuviaAppName = property("mutuvia.appName", "Mutuvia")

// package.json is the single source of truth for the version.
val packageJsonVersion = Regex(""""version"\s*:\s*"([^"]+)"""")
    .find(rootProject.file("../package.json").readText())?.groupValues?.get(1)
    ?: error("No \"version\" in package.json")
val mutuviaVersion = property("mutuvia.version", packageJsonVersion).removePrefix("v")

// MAJOR*10000 + MINOR*100 + PATCH, pre-release suffix ignored: 0.4.0 -> 400.
val mutuviaVersionCode = Regex("""^(\d+)\.(\d+)\.(\d+)""").find(mutuviaVersion)
    ?.destructured?.let { (major, minor, patch) ->
        require(minor.toInt() < 100 && patch.toInt() < 100) { "minor and patch must be < 100: $mutuviaVersion" }
        major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
    } ?: error("mutuvia.version must be MAJOR.MINOR.PATCH, got '$mutuviaVersion'")

require("/" !in mutuviaHost && ":" !in mutuviaHost) {
    "mutuvia.host must be a bare hostname (no scheme, port or path), got '$mutuviaHost'"
}
// A release pointing at the placeholder host could never verify its origin.
if (mutuviaHost == placeholderHost && gradle.startParameter.taskNames.any { "Release" in it }) {
    error("Release builds need a real host: pass -Pmutuvia.host=<deployment hostname>")
}

val releaseKeystorePath: String? = System.getenv("MUTUVIA_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }

android {
    namespace = "org.mutuvia.app"
    compileSdk = 36

    defaultConfig {
        applicationId = mutuviaApplicationId
        minSdk = 24
        targetSdk = 36
        versionCode = mutuviaVersionCode
        versionName = mutuviaVersion

        manifestPlaceholders["host"] = mutuviaHost
        manifestPlaceholders["appName"] = mutuviaAppName

        // Digital Asset Links statement pointing back at the website; quotes
        // are escaped for the generated string resource.
        resValue(
            "string",
            "asset_statements",
            """[{\"relation\":[\"delegate_permission/common.handle_all_urls\"],""" +
                """\"target\":{\"namespace\":\"web\",\"site\":\"https://$mutuviaHost/\"}}]",
        )
    }

    buildFeatures {
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    releaseKeystorePath?.let { keystorePath ->
        signingConfigs {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("MUTUVIA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MUTUVIA_KEY_ALIAS")
                keyPassword = System.getenv("MUTUVIA_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without MUTUVIA_KEYSTORE_PATH the release APK is left unsigned.
            if (releaseKeystorePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
