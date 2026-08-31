import SwiftUI

struct ContentView: View {
    @StateObject private var model = NexPlayAppModel()
    @State private var pageError: String?
    @State private var isPageLoading = true

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()

            NexPlayWebView(
                launchURL: launchURL,
                playbackBridge: model.playbackBridge,
                pageError: $pageError,
                isPageLoading: $isPageLoading
            )
            .ignoresSafeArea()
            .opacity(launchURL == nil ? 0 : 1)

            if let overlay = overlayContent {
                LoadingOverlay(
                    title: overlay.title,
                    message: overlay.message,
                    showsRetry: overlay.showsRetry,
                    retryAction: {
                        pageError = nil
                        isPageLoading = true
                        model.retry()
                    }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: overlayContent?.title)
        .task {
            model.start()
        }
    }

    private var launchURL: URL? {
        if case let .running(url) = model.state {
            return url
        }
        return nil
    }

    private var overlayContent: (title: String, message: String, showsRetry: Bool)? {
        if let pageError {
            return ("NexPlay could not load", pageError, true)
        }

        switch model.state {
        case .idle, .starting:
            return ("Starting NexPlay", "Preparing the local media workspace.", false)
        case .running:
            return isPageLoading ? ("Loading NexPlay", "Opening the iPhone interface.", false) : nil
        case let .failed(title, message):
            return (title, message, true)
        }
    }
}

private struct LoadingOverlay: View {
    let title: String
    let message: String
    let showsRetry: Bool
    let retryAction: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.cyan)
                .opacity(showsRetry ? 0 : 1)

            VStack(spacing: 8) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if showsRetry {
                Button("Retry", action: retryAction)
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)
            }
        }
        .padding(24)
        .frame(maxWidth: 340)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(24)
    }
}
