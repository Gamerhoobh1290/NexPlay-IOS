# NexPlay Android

This Android Studio project wraps the existing NexPlay web app in a native
`WebView` and serves the bundled site from `http://localhost:5000/`.

## Prerequisites

- JDK 17
- Android Studio with Android SDK installed
- Android SDK licenses accepted

## Build

From this `android/` directory:

```powershell
.\gradlew.bat assembleDebug
```

The debug APK will be created under:

```text
app/build/outputs/apk/debug/
```

