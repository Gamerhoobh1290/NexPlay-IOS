package com.nexplay.app

import android.content.Context
import android.content.res.AssetManager
import android.net.Uri
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.Closeable
import java.io.IOException
import java.io.InputStreamReader
import java.net.BindException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "NexPlayAssetServer"
private const val LOOPBACK_HOST = "127.0.0.1"
private const val LOOPBACK_PORT = 5000
private const val HOME_PATH = "/NexPlay.mobile.html"
private const val HEALTH_PATH = "/__nexplay_health"

sealed interface AssetServerState {
    data object Idle : AssetServerState

    data class Running(
        val launchUrl: String = "http://localhost:$LOOPBACK_PORT$HOME_PATH",
        val healthUrl: String = "http://localhost:$LOOPBACK_PORT$HEALTH_PATH"
    ) : AssetServerState

    data class Failed(
        val title: String,
        val message: String
    ) : AssetServerState
}

class NexPlayAssetServerManager {
    private val lock = Any()
    private var server: NexPlayAssetServer? = null
    private var state: AssetServerState = AssetServerState.Idle

    fun startIfNeeded(context: Context): AssetServerState = synchronized(lock) {
        val current = state
        if (current is AssetServerState.Running) {
            return current
        }

        try {
            val nextServer = NexPlayAssetServer(context.applicationContext.assets)
            nextServer.start()
            server = nextServer
            state = AssetServerState.Running()
        } catch (bindException: BindException) {
            state = AssetServerState.Failed(
                title = "Port 5000 Unavailable",
                message = "NexPlay could not bind http://localhost:$LOOPBACK_PORT/ because that port is already in use. Close the conflicting process and tap Retry."
            )
        } catch (error: Exception) {
            Log.e(TAG, "Unable to start loopback asset server", error)
            state = AssetServerState.Failed(
                title = "Local Server Failed",
                message = error.message ?: "NexPlay could not start the embedded localhost server."
            )
        }

        state
    }

    fun retry(context: Context): AssetServerState = synchronized(lock) {
        stopLocked()
        state = AssetServerState.Idle
        startIfNeeded(context)
    }

    private fun stopLocked() {
        try {
            server?.close()
        } catch (error: Exception) {
            Log.w(TAG, "Ignoring loopback server shutdown error", error)
        } finally {
            server = null
        }
    }
}

class NexPlayAssetServer(
    private val assetManager: AssetManager
) : Closeable {
    private val running = AtomicBoolean(false)
    private val acceptExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "nexplay-asset-accept").apply { isDaemon = true }
    }
    private val requestExecutor: ExecutorService = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "nexplay-asset-request").apply { isDaemon = true }
    }
    private var serverSocket: ServerSocket? = null

    @Throws(IOException::class)
    fun start() {
        if (running.get()) return

        val socket = ServerSocket(LOOPBACK_PORT, 0, InetAddress.getByName(LOOPBACK_HOST))
        serverSocket = socket
        running.set(true)

        acceptExecutor.execute {
            acceptLoop(socket)
        }
    }

    private fun acceptLoop(socket: ServerSocket) {
        while (running.get()) {
            try {
                val client = socket.accept()
                requestExecutor.execute {
                    client.use(::handleConnection)
                }
            } catch (socketException: SocketException) {
                if (running.get()) {
                    Log.w(TAG, "Loopback server socket exception", socketException)
                }
            } catch (ioException: IOException) {
                if (running.get()) {
                    Log.e(TAG, "Loopback accept failed", ioException)
                }
            }
        }
    }

    private fun handleConnection(socket: Socket) {
        socket.soTimeout = 5_000

        BufferedInputStream(socket.getInputStream()).use { input ->
            BufferedOutputStream(socket.getOutputStream()).use { output ->
                val reader = BufferedReader(InputStreamReader(input, StandardCharsets.ISO_8859_1))
                val requestLine = reader.readLine() ?: return
                val requestParts = requestLine.split(' ')
                if (requestParts.size < 2) {
                    writePlainResponse(output, 400, "Bad Request", "Malformed request.")
                    return
                }

                val method = requestParts[0].uppercase()
                val rawTarget = requestParts[1]
                drainHeaders(reader)

                if (method != "GET" && method != "HEAD") {
                    writePlainResponse(output, 405, "Method Not Allowed", "Only GET and HEAD are supported.", method == "HEAD")
                    return
                }

                val rawPath = try {
                    Uri.parse(rawTarget).path ?: "/"
                } catch (_: Exception) {
                    "/"
                }

                when (rawPath) {
                    HEALTH_PATH -> writeJsonResponse(
                        output = output,
                        statusCode = 200,
                        statusText = "OK",
                        body = """{"status":"ok","app":"nexplay-android","port":$LOOPBACK_PORT}""",
                        headOnly = method == "HEAD"
                    )

                    else -> serveAsset(output, rawPath, method == "HEAD")
                }
            }
        }
    }

    private fun serveAsset(output: BufferedOutputStream, rawPath: String, headOnly: Boolean) {
        val relativePath = sanitizeAssetPath(rawPath)
        if (relativePath == null) {
            writePlainResponse(output, 403, "Forbidden", "Path traversal is not allowed.", headOnly)
            return
        }

        val body = loadAssetBytes(relativePath)
        if (body == null) {
            val fallback = loadAssetBytes("404.html")
            if (fallback != null) {
                writeBytesResponse(output, 404, "Not Found", "text/html; charset=utf-8", fallback, headOnly)
            } else {
                writePlainResponse(output, 404, "Not Found", "Asset not found: $relativePath", headOnly)
            }
            return
        }

        writeBytesResponse(output, 200, "OK", guessMimeType(relativePath), body, headOnly)
    }

    private fun sanitizeAssetPath(rawPath: String): String? {
        val decoded = Uri.decode(rawPath).ifBlank { "/" }
        val normalized = if (decoded == "/") HOME_PATH else decoded
        val segments = normalized
            .split('/')
            .filter { it.isNotBlank() }

        if (segments.isEmpty()) return HOME_PATH.removePrefix("/")
        if (segments.any { it == "." || it == ".." }) return null

        return segments.joinToString("/")
    }

    private fun loadAssetBytes(assetPath: String): ByteArray? {
        return try {
            assetManager.open(assetPath).use { stream ->
                stream.readBytes()
            }
        } catch (_: IOException) {
            null
        }
    }

    private fun drainHeaders(reader: BufferedReader) {
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
        }
    }

    private fun writeJsonResponse(
        output: BufferedOutputStream,
        statusCode: Int,
        statusText: String,
        body: String,
        headOnly: Boolean
    ) {
        writeBytesResponse(
            output = output,
            statusCode = statusCode,
            statusText = statusText,
            contentType = "application/json; charset=utf-8",
            body = body.toByteArray(StandardCharsets.UTF_8),
            headOnly = headOnly
        )
    }

    private fun writePlainResponse(
        output: BufferedOutputStream,
        statusCode: Int,
        statusText: String,
        body: String,
        headOnly: Boolean = false
    ) {
        writeBytesResponse(
            output = output,
            statusCode = statusCode,
            statusText = statusText,
            contentType = "text/plain; charset=utf-8",
            body = body.toByteArray(StandardCharsets.UTF_8),
            headOnly = headOnly
        )
    }

    private fun writeBytesResponse(
        output: BufferedOutputStream,
        statusCode: Int,
        statusText: String,
        contentType: String,
        body: ByteArray,
        headOnly: Boolean
    ) {
        val headers = buildString {
            append("HTTP/1.1 $statusCode $statusText\r\n")
            append("Content-Type: $contentType\r\n")
            append("Content-Length: ${body.size}\r\n")
            append("Cache-Control: no-cache\r\n")
            append("Connection: close\r\n")
            append("\r\n")
        }.toByteArray(StandardCharsets.UTF_8)

        output.write(headers)
        if (!headOnly) {
            output.write(body)
        }
        output.flush()
    }

    private fun guessMimeType(path: String): String {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> "text/html; charset=utf-8"
            lower.endsWith(".css") -> "text/css; charset=utf-8"
            lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") -> "text/javascript; charset=utf-8"
            lower.endsWith(".json") -> "application/json; charset=utf-8"
            lower.endsWith(".webmanifest") -> "application/manifest+json"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".gif") -> "image/gif"
            lower.endsWith(".ico") -> "image/x-icon"
            lower.endsWith(".mp3") -> "audio/mpeg"
            lower.endsWith(".wav") -> "audio/wav"
            lower.endsWith(".ogg") || lower.endsWith(".oga") -> "audio/ogg"
            lower.endsWith(".m4a") -> "audio/mp4"
            lower.endsWith(".aac") -> "audio/aac"
            lower.endsWith(".flac") -> "audio/flac"
            lower.endsWith(".mp4") -> "video/mp4"
            lower.endsWith(".webm") -> "video/webm"
            lower.endsWith(".ogv") -> "video/ogg"
            lower.endsWith(".mov") -> "video/quicktime"
            lower.endsWith(".txt") -> "text/plain; charset=utf-8"
            else -> "application/octet-stream"
        }
    }

    override fun close() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: IOException) {
        }
        requestExecutor.shutdownNow()
        acceptExecutor.shutdownNow()
    }
}
