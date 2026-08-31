import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
    kotlin("android")
}

val repoRoot = rootProject.projectDir.parentFile
val syncedAssetDir = layout.buildDirectory.dir("generated/nexplay/site")

val syncWebAssets by tasks.registering(Sync::class) {
    group = "nexplay"
    description = "Copies the required NexPlay web assets into the Android app assets directory."

    from(repoRoot) {
        include(
            "NexPlay.html",
            "NexPlay.mobile.html",
            "index.html",
            "404.html",
            "manifest.webmanifest",
            "manifest.iphone.webmanifest",
            "sw.js",
            "tailwind.generated.css",
            "NexPlay_N_final_256.ico",
            "nexplay-icon-brand.png",
            "nexplay-next/**/*"
        )
        includeEmptyDirs = false
    }

    into(syncedAssetDir)
    includeEmptyDirs = false
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE

    doFirst {
        delete(syncedAssetDir.get().asFile)
    }
}

android {
    namespace = "com.nexplay.app"
    compileSdk = 35

    sourceSets.getByName("main").assets.srcDir(syncedAssetDir)

    defaultConfig {
        applicationId = "com.nexplay.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.media:media:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.material:material:1.12.0")
}
