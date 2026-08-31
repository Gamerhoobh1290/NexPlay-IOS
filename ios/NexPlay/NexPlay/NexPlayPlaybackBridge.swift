import AVFoundation
import Foundation
import MediaPlayer
import UIKit
import WebKit

final class NexPlayPlaybackBridge: NSObject {
    private weak var webView: WKWebView?
    private var configuredRemoteCommands = false
    private var configuredNotifications = false
    private var remoteCommandTargets: [(MPRemoteCommand, Any)] = []
    private var notificationTokens: [NSObjectProtocol] = []

    private var isPlaying = false
    private var wasPlayingBeforeInterruption = false
    private var currentTrackID = ""
    private var currentArtworkSource = ""
    private var currentArtwork: UIImage?
    private var artworkTask: URLSessionDataTask?
    private let artworkCache = NSCache<NSURL, UIImage>()

    func attach(webView: WKWebView) {
        self.webView = webView
        configureAudioSession(activate: false)
        configureRemoteCommandsIfNeeded()
        observeAudioSessionIfNeeded()
    }

    func handleScriptMessage(_ body: Any) {
        guard let payload = body as? [String: Any],
              let type = payload["type"] as? String
        else {
            return
        }

        switch type {
        case "bridgeReady":
            configureAudioSession(activate: false)
        case "playbackSnapshot":
            if let snapshot = payload["snapshot"] as? [String: Any] {
                isPlaying = boolValue(snapshot["isPlaying"])
                if isPlaying {
                    configureAudioSession(activate: true)
                }
                updateNowPlaying(snapshot)
            }
        default:
            break
        }
    }

    private func configureAudioSession(activate: Bool) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.allowAirPlay])
            if activate {
                try session.setActive(true)
            }
        } catch {
            #if DEBUG
            print("NexPlay audio session configuration failed: \(error.localizedDescription)")
            #endif
        }
    }

    private func observeAudioSessionIfNeeded() {
        guard !configuredNotifications else { return }
        configuredNotifications = true

        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.handleAudioInterruption(notification)
        })
        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.handleRouteChange(notification)
        })
        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.configureAudioSession(activate: self.isPlaying)
        })
    }

    private func handleAudioInterruption(_ notification: Notification) {
        guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else {
            return
        }

        switch type {
        case .began:
            wasPlayingBeforeInterruption = isPlaying
            if isPlaying {
                runCommand(NexPlayIOSBridgeScripts.pauseCommand)
            }
        case .ended:
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)
            let shouldResume = wasPlayingBeforeInterruption && options.contains(.shouldResume)
            wasPlayingBeforeInterruption = false
            if shouldResume {
                configureAudioSession(activate: true)
                runCommand(NexPlayIOSBridgeScripts.playCommand)
            }
        @unknown default:
            wasPlayingBeforeInterruption = false
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: rawReason) == .oldDeviceUnavailable,
              isPlaying
        else {
            return
        }

        runCommand(NexPlayIOSBridgeScripts.pauseCommand)
    }

    private func configureRemoteCommandsIfNeeded() {
        guard !configuredRemoteCommands else { return }
        configuredRemoteCommands = true

        let commandCenter = MPRemoteCommandCenter.shared()

        remoteCommandTargets.append((commandCenter.playCommand, commandCenter.playCommand.addTarget { [weak self] _ in
            guard let self, self.webView != nil else { return .noActionableNowPlayingItem }
            self.configureAudioSession(activate: true)
            self.runCommand(NexPlayIOSBridgeScripts.playCommand)
            return .success
        }))

        remoteCommandTargets.append((commandCenter.pauseCommand, commandCenter.pauseCommand.addTarget { [weak self] _ in
            guard let self, self.webView != nil else { return .noActionableNowPlayingItem }
            self.runCommand(NexPlayIOSBridgeScripts.pauseCommand)
            return .success
        }))

        remoteCommandTargets.append((commandCenter.togglePlayPauseCommand, commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self, self.webView != nil else { return .noActionableNowPlayingItem }
            self.configureAudioSession(activate: true)
            self.runCommand(NexPlayIOSBridgeScripts.toggleCommand)
            return .success
        }))

        remoteCommandTargets.append((commandCenter.nextTrackCommand, commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            guard let self, self.webView != nil else { return .noActionableNowPlayingItem }
            self.runCommand(NexPlayIOSBridgeScripts.nextCommand)
            return .success
        }))

        remoteCommandTargets.append((commandCenter.previousTrackCommand, commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            guard let self, self.webView != nil else { return .noActionableNowPlayingItem }
            self.runCommand(NexPlayIOSBridgeScripts.previousCommand)
            return .success
        }))

        remoteCommandTargets.append((commandCenter.changePlaybackPositionCommand, commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self,
                  self.webView != nil,
                  let event = event as? MPChangePlaybackPositionCommandEvent
            else {
                return .commandFailed
            }

            let milliseconds = max(0, Int(event.positionTime * 1000))
            self.runCommand(NexPlayIOSBridgeScripts.seekToCommand(positionMs: milliseconds))
            return .success
        }))

        updateRemoteCommandAvailability(hasTrack: false, duration: 0)
    }

    private func updateRemoteCommandAvailability(hasTrack: Bool, duration: Double) {
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.playCommand.isEnabled = hasTrack
        commandCenter.pauseCommand.isEnabled = hasTrack
        commandCenter.togglePlayPauseCommand.isEnabled = hasTrack
        commandCenter.nextTrackCommand.isEnabled = hasTrack
        commandCenter.previousTrackCommand.isEnabled = hasTrack
        commandCenter.changePlaybackPositionCommand.isEnabled = hasTrack && duration > 0
    }

    private func runCommand(_ script: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script)
        }
    }

    private func updateNowPlaying(_ snapshot: [String: Any]) {
        let title = stringValue(snapshot["title"])
        let duration = max(0, doubleValue(snapshot["durationMs"]) / 1000)
        guard !title.isEmpty else {
            currentTrackID = ""
            currentArtworkSource = ""
            currentArtwork = nil
            artworkTask?.cancel()
            artworkTask = nil
            updateRemoteCommandAvailability(hasTrack: false, duration: 0)
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            MPNowPlayingInfoCenter.default().playbackState = .stopped
            return
        }

        let trackID = stringValue(snapshot["trackId"])
        let artist = stringValue(snapshot["artist"])
        let album = stringValue(snapshot["album"])
        let artworkSource = stringValue(snapshot["artworkUrl"])
        let position = max(0, doubleValue(snapshot["positionMs"]) / 1000)
        let speed = max(0, doubleValue(snapshot["speed"], fallback: 1))

        if currentTrackID != trackID || currentArtworkSource != artworkSource {
            currentArtwork = nil
        }
        currentTrackID = trackID
        currentArtworkSource = artworkSource

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPMediaItemPropertyAlbumTitle: album,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: min(position, duration > 0 ? duration : position),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? speed : 0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]

        if !trackID.isEmpty {
            info[MPNowPlayingInfoPropertyExternalContentIdentifier] = trackID
        }
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let currentArtwork {
            info[MPMediaItemPropertyArtwork] = mediaItemArtwork(for: currentArtwork)
        }

        updateRemoteCommandAvailability(hasTrack: true, duration: duration)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
        loadArtworkIfNeeded(artworkSource, trackID: trackID)
    }

    private func loadArtworkIfNeeded(_ source: String, trackID: String) {
        guard !source.isEmpty, currentArtwork == nil else { return }

        if source.hasPrefix("data:image/"),
           let separator = source.firstIndex(of: ","),
           source[..<separator].contains(";base64"),
           let data = Data(base64Encoded: String(source[source.index(after: separator)...]), options: .ignoreUnknownCharacters),
           let image = UIImage(data: data) {
            installArtwork(image, source: source, trackID: trackID)
            return
        }

        guard let url = URL(string: source, relativeTo: webView?.url)?.absoluteURL,
              url.scheme == "http" || url.scheme == "https"
        else {
            return
        }

        if let cached = artworkCache.object(forKey: url as NSURL) {
            installArtwork(cached, source: source, trackID: trackID)
            return
        }

        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let self,
                  let data,
                  data.count <= 10_000_000,
                  let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode),
                  let image = UIImage(data: data)
            else {
                return
            }

            self.artworkCache.setObject(image, forKey: url as NSURL)
            DispatchQueue.main.async {
                self.installArtwork(image, source: source, trackID: trackID)
            }
        }
        artworkTask?.resume()
    }

    private func installArtwork(_ image: UIImage, source: String, trackID: String) {
        guard currentTrackID == trackID, currentArtworkSource == source else { return }
        currentArtwork = image
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyArtwork] = mediaItemArtwork(for: image)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func mediaItemArtwork(for image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    private func stringValue(_ value: Any?) -> String {
        switch value {
        case let value as String:
            return value
        case let value as CustomStringConvertible:
            return value.description
        default:
            return ""
        }
    }

    private func boolValue(_ value: Any?) -> Bool {
        switch value {
        case let value as Bool:
            return value
        case let value as NSNumber:
            return value.boolValue
        case let value as String:
            return value == "true" || value == "1"
        default:
            return false
        }
    }

    private func doubleValue(_ value: Any?, fallback: Double = 0) -> Double {
        switch value {
        case let value as Double:
            return value
        case let value as Float:
            return Double(value)
        case let value as Int:
            return Double(value)
        case let value as NSNumber:
            return value.doubleValue
        case let value as String:
            return Double(value) ?? fallback
        default:
            return fallback
        }
    }

    deinit {
        artworkTask?.cancel()
        remoteCommandTargets.forEach { command, target in
            command.removeTarget(target)
        }
        notificationTokens.forEach { token in
            NotificationCenter.default.removeObserver(token)
        }
    }
}
