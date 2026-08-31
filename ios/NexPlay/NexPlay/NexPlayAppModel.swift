import Combine
import Foundation

final class NexPlayAppModel: ObservableObject {
    enum State: Equatable {
        case idle
        case starting
        case running(URL)
        case failed(String, String)
    }

    @Published private(set) var state: State = .idle

    let playbackBridge = NexPlayPlaybackBridge()

    private let assetServer = NexPlayAssetServer()
    private var hasStarted = false

    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        startServer()
    }

    func retry() {
        assetServer.stop()
        hasStarted = true
        startServer()
    }

    private func startServer() {
        state = .starting

        DispatchQueue.global(qos: .userInitiated).async { [weak self, assetServer] in
            do {
                let launchURL = try assetServer.startIfNeeded()
                DispatchQueue.main.async {
                    self?.state = .running(launchURL)
                }
            } catch let error as NexPlayAssetServer.ServerError {
                DispatchQueue.main.async {
                    self?.state = .failed(error.title, error.message)
                }
            } catch {
                DispatchQueue.main.async {
                    self?.state = .failed(
                        "Local Server Failed",
                        error.localizedDescription
                    )
                }
            }
        }
    }

    deinit {
        assetServer.stop()
    }
}
