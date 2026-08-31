# NexPlay iOS

This is an iPhone wrapper for the existing NexPlay web app. It mirrors the Android app's approach:

- bundles the same NexPlay web assets during the Xcode build
- starts a local `http://localhost:5000/` asset server inside the app
- loads `NexPlay.mobile.html` in `WKWebView`
- bridges playback state to iOS lock-screen and Control Center media controls
- handles audio interruptions, headphone disconnects, and lock-screen artwork

## Test on an iPhone

### Without a Mac

You can test the iPhone UI from Windows as a Safari web app while the PC is on:

1. Make sure your Windows PC and iPhone are on the same Wi-Fi network.
2. From the project root on Windows, run:

```powershell
npm run serve:iphone
```

3. Open the printed `iPhone:` URL in Safari on your iPhone.
4. To install it like an app, tap **Share** then **Add to Home Screen**.

If Safari cannot open the URL, allow Node.js through Windows Firewall for private networks, then run the command again.

This local URL will stop working when the PC is off. For a PC-off iPhone setup, publish the project files to an HTTPS static host such as Netlify, Cloudflare Pages, GitHub Pages, or Vercel, then open that HTTPS URL in Safari and use **Share** -> **Add to Home Screen**.

The mobile page registers `sw.js` only on HTTPS or localhost. After the hosted app has loaded once, the service worker caches the NexPlay mobile shell so the Home Screen app can reopen without your PC. Music from online providers still needs internet, and any files that only live on your Windows PC are not available to the iPhone unless you import them on the phone or host/sync them separately.

### Native iOS App

1. Open `ios/NexPlay/NexPlay.xcodeproj` in Xcode on a Mac.
2. Select the `NexPlay` scheme and an iPhone simulator, then press **Run**. Simulator builds do not require signing.
3. For a physical iPhone, connect and trust the Mac, select the `NexPlay` target, then set your team under **Signing & Capabilities**.
4. If Xcode says the bundle identifier is unavailable, change `com.nexplay.app.ios` to a unique reverse-DNS value.
5. Select the connected iPhone as the run destination and press **Run**. A free Apple ID may require trusting the developer profile in **Settings > General > VPN & Device Management**.

No CocoaPods or Swift Package dependencies are required. The Xcode build phase named **Sync NexPlay Web Assets** copies the mobile page and its local CSS, JavaScript, components, artwork, vendor, and `nexplay-next` dependencies into the iOS app bundle each time you build.

## Use the app

- **Local Music:** tap **Import songs**, choose one or more supported audio files from Files, and repeat for additional batches. Imported files are stored in the app's website-data container so they can be restored after relaunch, subject to available device storage.
- **Online Music:** open **Search**, choose **Online**, enter a song or artist, and tap **Search**. iTunes and Deezer provide catalog results without configuration.
- **Online playback and YouTube Music playlist import:** create a Google Cloud key with **YouTube Data API v3** enabled. In NexPlay, open **Settings > Online Music**, enter the key, and leave **Prefer YouTube discovery** enabled. Restrict the key to YouTube Data API v3; an iOS `WKWebView` cannot reliably satisfy HTTP-referrer application restrictions, so use quota limits and a dedicated key.
- **Library and playlists:** save an Online Music result with **Add To Library**, or use a track's playlist action. Saved local and online metadata, favorites, playlists, history, settings, and queue-related state use NexPlay's existing device-local persistence.
- **Player:** the bottom mini-player controls previous, play/pause, next, and queue. Tap its artwork or track information to open Now Playing, where seeking, shuffle, repeat, and the full queue are available.

The target already declares the `audio` background mode in `Info.plist`; no extra toggle is required. Local audio is integrated with `AVAudioSession`, `MPNowPlayingInfoCenter`, and `MPRemoteCommandCenter`. Test lock-screen playback, Control Center, interruptions, wired/Bluetooth route changes, and headphone removal on a physical iPhone because the simulator does not reproduce those behaviors faithfully.

## Notes

- iOS requires macOS and Xcode to build or install onto a real iPhone.
- The app uses iOS 16.0 as its deployment target.
- YouTube-backed playback remains subject to network availability, provider embedding rules, and `WKWebView` background-media behavior.
