import SwiftUI
import UIKit
import WebKit

struct NexPlayWebView: UIViewRepresentable {
    let launchURL: URL?
    let playbackBridge: NexPlayPlaybackBridge
    @Binding var pageError: String?
    @Binding var isPageLoading: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "nexplayIOS")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        playbackBridge.attach(webView: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        playbackBridge.attach(webView: webView)

        guard let launchURL else { return }
        guard context.coordinator.loadedURL != launchURL else { return }

        context.coordinator.loadedURL = launchURL
        DispatchQueue.main.async {
            pageError = nil
            isPageLoading = true
        }

        let request = URLRequest(
            url: launchURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 30
        )
        webView.load(request)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "nexplayIOS")
        webView.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private var parent: NexPlayWebView
        var loadedURL: URL?

        init(_ parent: NexPlayWebView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            parent.playbackBridge.handleScriptMessage(message.body)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript(NexPlayIOSBridgeScripts.installPlaybackBridge)
            parent.isPageLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleLoadError(error, for: webView.url)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handleLoadError(error, for: webView.url ?? loadedURL)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if navigationAction.targetFrame == nil {
                if Self.isLocalAppURL(url) {
                    webView.load(navigationAction.request)
                } else {
                    UIApplication.shared.open(url)
                }
                decisionHandler(.cancel)
                return
            }

            if navigationAction.targetFrame?.isMainFrame == true && !Self.isLocalAppURL(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        private func handleLoadError(_ error: Error, for url: URL?) {
            guard url.map(Self.isLocalAppURL) ?? true else { return }

            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                return
            }

            parent.isPageLoading = false
            parent.pageError = error.localizedDescription
        }

        private static func isLocalAppURL(_ url: URL) -> Bool {
            guard url.scheme == "http" || url.scheme == "https" else { return false }
            let host = url.host?.lowercased()
            let port = url.port ?? 80
            return port == 5000 && (host == "localhost" || host == "127.0.0.1")
        }
    }
}
