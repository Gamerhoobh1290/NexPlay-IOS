import Darwin
import Foundation

final class NexPlayAssetServer {
    struct ServerError: Error {
        let title: String
        let message: String
    }

    private let host = "127.0.0.1"
    private let port: UInt16 = 5000
    private let homePath = "/NexPlay.mobile.html"
    private let healthPath = "/__nexplay_health"
    private let acceptQueue = DispatchQueue(label: "com.nexplay.ios.asset-server.accept")
    private let requestQueue = DispatchQueue(label: "com.nexplay.ios.asset-server.request", attributes: .concurrent)
    private let lock = NSLock()

    private var listenSocket: Int32 = -1
    private var running = false

    var launchURL: URL {
        URL(string: "http://localhost:\(port)\(homePath)")!
    }

    func startIfNeeded() throws -> URL {
        lock.lock()
        defer { lock.unlock() }

        if running {
            return launchURL
        }

        let socketDescriptor = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard socketDescriptor >= 0 else {
            throw ServerError(
                title: "Local Server Failed",
                message: "NexPlay could not create a local network socket."
            )
        }

        var reuse: Int32 = 1
        setsockopt(
            socketDescriptor,
            SOL_SOCKET,
            SO_REUSEADDR,
            &reuse,
            socklen_t(MemoryLayout<Int32>.size)
        )

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(port).bigEndian
        address.sin_addr = in_addr(s_addr: host.withCString { inet_addr($0) })

        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                Darwin.bind(
                    socketDescriptor,
                    socketAddress,
                    socklen_t(MemoryLayout<sockaddr_in>.size)
                )
            }
        }

        guard bindResult == 0 else {
            let currentErrno = errno
            Darwin.close(socketDescriptor)
            if currentErrno == EADDRINUSE {
                throw ServerError(
                    title: "Port 5000 Unavailable",
                    message: "NexPlay could not bind http://localhost:\(port)/ because that port is already in use. Close the conflicting app and retry."
                )
            }

            throw ServerError(
                title: "Local Server Failed",
                message: String(cString: strerror(currentErrno))
            )
        }

        guard Darwin.listen(socketDescriptor, SOMAXCONN) == 0 else {
            let currentErrno = errno
            Darwin.close(socketDescriptor)
            throw ServerError(
                title: "Local Server Failed",
                message: String(cString: strerror(currentErrno))
            )
        }

        listenSocket = socketDescriptor
        running = true

        acceptQueue.async { [weak self] in
            self?.acceptLoop(socketDescriptor)
        }

        return launchURL
    }

    func stop() {
        lock.lock()
        let socketDescriptor = listenSocket
        running = false
        listenSocket = -1
        lock.unlock()

        if socketDescriptor >= 0 {
            Darwin.shutdown(socketDescriptor, SHUT_RDWR)
            Darwin.close(socketDescriptor)
        }
    }

    private func acceptLoop(_ socketDescriptor: Int32) {
        while isRunning {
            let client = Darwin.accept(socketDescriptor, nil, nil)
            if client < 0 {
                continue
            }

            requestQueue.async { [weak self] in
                self?.handleConnection(client)
                Darwin.close(client)
            }
        }
    }

    private var isRunning: Bool {
        lock.lock()
        defer { lock.unlock() }
        return running
    }

    private func handleConnection(_ client: Int32) {
        var timeout = timeval(tv_sec: 5, tv_usec: 0)
        setsockopt(
            client,
            SOL_SOCKET,
            SO_RCVTIMEO,
            &timeout,
            socklen_t(MemoryLayout<timeval>.size)
        )

        guard let request = readRequest(from: client) else {
            return
        }

        let lines = request.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            writePlainResponse(client, statusCode: 400, statusText: "Bad Request", body: "Malformed request.")
            return
        }

        let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
        guard parts.count >= 2 else {
            writePlainResponse(client, statusCode: 400, statusText: "Bad Request", body: "Malformed request.")
            return
        }

        let method = parts[0].uppercased()
        let target = parts[1]
        let headOnly = method == "HEAD"

        guard method == "GET" || method == "HEAD" else {
            writePlainResponse(
                client,
                statusCode: 405,
                statusText: "Method Not Allowed",
                body: "Only GET and HEAD are supported.",
                headOnly: headOnly
            )
            return
        }

        let path = requestPath(from: target)
        if path == healthPath {
            let body = #"{"status":"ok","app":"nexplay-ios","port":5000}"#
            writeResponse(
                client,
                statusCode: 200,
                statusText: "OK",
                contentType: "application/json; charset=utf-8",
                body: Data(body.utf8),
                headOnly: headOnly
            )
            return
        }

        serveAsset(client, rawPath: path, headOnly: headOnly)
    }

    private func readRequest(from client: Int32) -> String? {
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 2048)
        let headerEnd = Data("\r\n\r\n".utf8)

        while data.count < 16_384 {
            let count = buffer.withUnsafeMutableBytes { rawBuffer in
                Darwin.recv(client, rawBuffer.baseAddress, rawBuffer.count, 0)
            }

            if count <= 0 {
                break
            }

            data.append(buffer, count: count)
            if data.range(of: headerEnd) != nil {
                break
            }
        }

        guard !data.isEmpty else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    private func requestPath(from target: String) -> String {
        if let url = URL(string: target), !url.path.isEmpty {
            return url.path
        }

        return String(target.split(separator: "?", maxSplits: 1).first ?? "/")
    }

    private func serveAsset(_ client: Int32, rawPath: String, headOnly: Bool) {
        guard let relativePath = sanitize(rawPath) else {
            writePlainResponse(
                client,
                statusCode: 403,
                statusText: "Forbidden",
                body: "Path traversal is not allowed.",
                headOnly: headOnly
            )
            return
        }

        if let body = loadAsset(relativePath) {
            writeResponse(
                client,
                statusCode: 200,
                statusText: "OK",
                contentType: mimeType(for: relativePath),
                body: body,
                headOnly: headOnly
            )
            return
        }

        if let fallback = loadAsset("404.html") {
            writeResponse(
                client,
                statusCode: 404,
                statusText: "Not Found",
                contentType: "text/html; charset=utf-8",
                body: fallback,
                headOnly: headOnly
            )
            return
        }

        writePlainResponse(
            client,
            statusCode: 404,
            statusText: "Not Found",
            body: "Asset not found: \(relativePath)",
            headOnly: headOnly
        )
    }

    private func sanitize(_ rawPath: String) -> String? {
        let decoded = (rawPath.removingPercentEncoding ?? rawPath).isEmpty ? "/" : (rawPath.removingPercentEncoding ?? rawPath)
        guard !decoded.contains("\\") else { return nil }

        let normalized = decoded == "/" ? homePath : decoded
        let segments = normalized
            .split(separator: "/")
            .map(String.init)
            .filter { !$0.isEmpty }

        if segments.isEmpty {
            return String(homePath.dropFirst())
        }

        guard !segments.contains(where: { $0 == "." || $0 == ".." }) else {
            return nil
        }

        return segments.joined(separator: "/")
    }

    private func loadAsset(_ relativePath: String) -> Data? {
        guard let webRoot = Bundle.main.resourceURL?.appendingPathComponent("Web", isDirectory: true) else {
            return nil
        }

        let rootPath = webRoot.standardizedFileURL.path
        let assetURL = webRoot.appendingPathComponent(relativePath, isDirectory: false).standardizedFileURL
        guard assetURL.path == rootPath || assetURL.path.hasPrefix(rootPath + "/") else {
            return nil
        }

        return try? Data(contentsOf: assetURL)
    }

    private func writePlainResponse(
        _ client: Int32,
        statusCode: Int,
        statusText: String,
        body: String,
        headOnly: Bool = false
    ) {
        writeResponse(
            client,
            statusCode: statusCode,
            statusText: statusText,
            contentType: "text/plain; charset=utf-8",
            body: Data(body.utf8),
            headOnly: headOnly
        )
    }

    private func writeResponse(
        _ client: Int32,
        statusCode: Int,
        statusText: String,
        contentType: String,
        body: Data,
        headOnly: Bool
    ) {
        var headers = ""
        headers += "HTTP/1.1 \(statusCode) \(statusText)\r\n"
        headers += "Content-Type: \(contentType)\r\n"
        headers += "Content-Length: \(body.count)\r\n"
        headers += "Cache-Control: no-cache\r\n"
        headers += "Connection: close\r\n"
        headers += "\r\n"

        writeAll(Data(headers.utf8), to: client)
        if !headOnly {
            writeAll(body, to: client)
        }
    }

    private func writeAll(_ data: Data, to client: Int32) {
        data.withUnsafeBytes { rawBuffer in
            guard let baseAddress = rawBuffer.baseAddress else { return }

            var sentBytes = 0
            while sentBytes < rawBuffer.count {
                let result = Darwin.send(
                    client,
                    baseAddress.advanced(by: sentBytes),
                    rawBuffer.count - sentBytes,
                    0
                )

                if result <= 0 {
                    break
                }

                sentBytes += result
            }
        }
    }

    private func mimeType(for path: String) -> String {
        let lower = path.lowercased()
        switch true {
        case lower.hasSuffix(".html"):
            return "text/html; charset=utf-8"
        case lower.hasSuffix(".css"):
            return "text/css; charset=utf-8"
        case lower.hasSuffix(".js"), lower.hasSuffix(".mjs"), lower.hasSuffix(".cjs"):
            return "text/javascript; charset=utf-8"
        case lower.hasSuffix(".json"):
            return "application/json; charset=utf-8"
        case lower.hasSuffix(".webmanifest"):
            return "application/manifest+json"
        case lower.hasSuffix(".svg"):
            return "image/svg+xml"
        case lower.hasSuffix(".png"):
            return "image/png"
        case lower.hasSuffix(".jpg"), lower.hasSuffix(".jpeg"):
            return "image/jpeg"
        case lower.hasSuffix(".gif"):
            return "image/gif"
        case lower.hasSuffix(".ico"):
            return "image/x-icon"
        case lower.hasSuffix(".mp3"):
            return "audio/mpeg"
        case lower.hasSuffix(".wav"):
            return "audio/wav"
        case lower.hasSuffix(".ogg"), lower.hasSuffix(".oga"):
            return "audio/ogg"
        case lower.hasSuffix(".m4a"):
            return "audio/mp4"
        case lower.hasSuffix(".aac"):
            return "audio/aac"
        case lower.hasSuffix(".flac"):
            return "audio/flac"
        case lower.hasSuffix(".mp4"):
            return "video/mp4"
        case lower.hasSuffix(".webm"):
            return "video/webm"
        case lower.hasSuffix(".ogv"):
            return "video/ogg"
        case lower.hasSuffix(".mov"):
            return "video/quicktime"
        case lower.hasSuffix(".txt"):
            return "text/plain; charset=utf-8"
        default:
            return "application/octet-stream"
        }
    }
}
