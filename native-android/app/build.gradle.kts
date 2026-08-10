plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseKeystoreFile = providers.environmentVariable("ANDROID_KEYSTORE_FILE").orNull
val releaseKeystorePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull
val releaseSigningConfigured = listOf(
    releaseKeystoreFile,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

if (releaseKeystoreFile != null && !releaseSigningConfigured) {
    error("A assinatura de release foi configurada parcialmente. Informe todas as variáveis ANDROID_KEYSTORE_* e ANDROID_KEY_*.")
}

android {
    namespace = "com.ronecaplaytv.nativeapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ronecaplaytv.nativeapp"
        minSdk = 23
        targetSdk = 36
        versionCode = 46
        versionName = "2.9.5"

        buildConfigField(
            "String",
            "SUPABASE_FUNCTIONS_URL",
            "\"https://awauvkjkucjqulkklmuo.supabase.co/functions/v1\"",
        )
        buildConfigField(
            "String",
            "UPDATE_API_URL",
            "\"https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/app-release\"",
        )
        buildConfigField("boolean", "SUSPEND_HYDRATION_DURING_TV_PLAYBACK", "true")
        buildConfigField("boolean", "COMPACT_XTREAM_PLAYBACK_URLS", "true")
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = file(requireNotNull(releaseKeystoreFile))
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.activity:activity-compose:1.12.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    implementation("androidx.tv:tv-material:1.1.0")
    implementation("androidx.tv:tv-foundation:1.0.0")

    implementation("androidx.media3:media3-exoplayer:1.9.2")
    implementation("androidx.media3:media3-exoplayer-hls:1.9.2")
    implementation("androidx.media3:media3-ui:1.9.2")
    implementation("androidx.media3:media3-datasource-okhttp:1.9.2")

    implementation("io.coil-kt.coil3:coil-compose:3.4.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.4.0")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.10.0")

    testImplementation("junit:junit:4.13.2")
}
