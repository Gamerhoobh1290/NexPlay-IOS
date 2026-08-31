package com.nexplay.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.LruCache
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat as MediaAppNotificationCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media.session.MediaButtonReceiver
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

internal class NexPlayMediaNotificationController(
    private val context: Context,
    private val commandTarget: CommandTarget
) {
    interface CommandTarget {
        fun onPlayRequested()
        fun onPauseRequested()
        fun onNextRequested()
        fun onPreviousRequested()
        fun onSeekToRequested(positionMs: Long)
    }

    companion object {
        private const val CHANNEL_ID = "nexplay_playback"
        private const val NOTIFICATION_ID = 7431
        private const val SESSION_TAG = "nexplay_media_session"
        private const val ARTWORK_RETRY_BACKOFF_MS = 10_000L

        private const val ACTIONS_MASK = PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val notificationManager = NotificationManagerCompat.from(context)
    private val artworkExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val artworkCache = LruCache<String, Bitmap>(20)

    private var latestSnapshot: PlaybackSnapshot? = null
    private var currentArtworkUrl: String = ""
    private var currentArtworkBitmap: Bitmap? = null
    private var lastMetadataSignature: String = ""
    private var lastNotificationSignature: String = ""
    private var visibleNotificationTrackId: String = ""
    private var notificationVisible = false
    private var pendingArtworkUrl: String = ""
    private var lastFailedArtworkUrl: String = ""
    private var lastFailedArtworkAtMs: Long = 0L
    private var bridgeReady = false

    private val mediaSession: MediaSessionCompat = MediaSessionCompat(context, SESSION_TAG).apply {
        setCallback(object : MediaSessionCompat.Callback() {
            override fun onPlay() {
                commandTarget.onPlayRequested()
            }

            override fun onPause() {
                commandTarget.onPauseRequested()
            }

            override fun onSkipToNext() {
                commandTarget.onNextRequested()
            }

            override fun onSkipToPrevious() {
                commandTarget.onPreviousRequested()
            }

            override fun onSeekTo(pos: Long) {
                applyOptimisticSeek(pos)
                commandTarget.onSeekToRequested(pos.coerceAtLeast(0))
            }
        })
        setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        )
    }

    init {
        ensureNotificationChannel()
    }

    fun onBridgeReady() {
        bridgeReady = true
    }

    fun consumePlaybackSnapshot(rawJson: String) {
        val snapshot = PlaybackSnapshot.fromJson(rawJson) ?: return
        latestSnapshot = snapshot
        renderSnapshot(snapshot)
    }

    fun release() {
        latestSnapshot = null
        currentArtworkBitmap = null
        currentArtworkUrl = ""
        pendingArtworkUrl = ""
        lastFailedArtworkUrl = ""
        lastFailedArtworkAtMs = 0L
        lastMetadataSignature = ""
        lastNotificationSignature = ""
        visibleNotificationTrackId = ""
        notificationVisible = false
        bridgeReady = false
        hideNotification()
        mediaSession.isActive = false
        mediaSession.release()
        artworkExecutor.shutdownNow()
    }

    private fun renderSnapshot(snapshot: PlaybackSnapshot) {
        val hasTrack = snapshot.trackId.isNotBlank() || snapshot.title.isNotBlank()
        if (!hasTrack) {
            clearSessionState()
            return
        }

        val normalized = snapshot.normalize()
        requestArtworkIfNeeded(normalized.artworkUrl)
        updatePlaybackState(normalized)
        updateMetadata(normalized, currentArtworkBitmap)

        mediaSession.isActive = true
        if (shouldRenderNotification(normalized)) {
            maybePublishNotification(normalized, currentArtworkBitmap)
        } else {
            visibleNotificationTrackId = ""
            hideNotification()
        }
    }

    private fun clearSessionState() {
        lastMetadataSignature = ""
        lastNotificationSignature = ""
        pendingArtworkUrl = ""
        lastFailedArtworkUrl = ""
        lastFailedArtworkAtMs = 0L
        currentArtworkUrl = ""
        currentArtworkBitmap = null
        visibleNotificationTrackId = ""
        notificationVisible = false
        mediaSession.setMetadata(null)
        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(ACTIONS_MASK)
                .setState(
                    PlaybackStateCompat.STATE_STOPPED,
                    0L,
                    0f,
                    SystemClock.elapsedRealtime()
                )
                .build()
        )
        mediaSession.isActive = false
        hideNotification()
    }

    private fun updatePlaybackState(snapshot: PlaybackSnapshot) {
        val playbackState = if (snapshot.isPlaying) {
            PlaybackStateCompat.STATE_PLAYING
        } else {
            PlaybackStateCompat.STATE_PAUSED
        }

        val speed = if (snapshot.isPlaying) snapshot.speed.toFloat() else 0f
        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(ACTIONS_MASK)
                .setState(
                    playbackState,
                    snapshot.positionMs,
                    if (speed > 0f) speed else 0f,
                    SystemClock.elapsedRealtime()
                )
                .build()
        )
    }

    private fun updateMetadata(snapshot: PlaybackSnapshot, artwork: Bitmap?) {
        val signature = buildString {
            append(snapshot.trackId)
            append('|')
            append(snapshot.title)
            append('|')
            append(snapshot.artist)
            append('|')
            append(snapshot.album)
            append('|')
            append(snapshot.durationMs)
            append('|')
            append(snapshot.artworkUrl)
            append('|')
            append(artwork?.hashCode() ?: 0)
        }
        if (signature == lastMetadataSignature) return

        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, snapshot.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, snapshot.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, snapshot.album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, snapshot.durationMs)

        if (artwork != null) {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork)
        }

        mediaSession.setMetadata(builder.build())
        lastMetadataSignature = signature
    }

    private fun shouldRenderNotification(snapshot: PlaybackSnapshot): Boolean {
        if (snapshot.trackId.isBlank() && snapshot.title.isBlank()) return false
        return snapshot.isPlaying || visibleNotificationTrackId == snapshot.trackId
    }

    private fun maybePublishNotification(
        snapshot: PlaybackSnapshot,
        artwork: Bitmap?,
        force: Boolean = false
    ) {
        val signature = buildNotificationSignature(snapshot, artwork)
        if (!force && notificationVisible && signature == lastNotificationSignature) return
        lastNotificationSignature = signature
        publishNotification(snapshot, artwork)
    }

    private fun buildNotificationSignature(snapshot: PlaybackSnapshot, artwork: Bitmap?): String {
        return buildString {
            append(snapshot.trackId)
            append('|')
            append(snapshot.title)
            append('|')
            append(snapshot.artist)
            append('|')
            append(snapshot.album)
            append('|')
            append(snapshot.durationMs)
            append('|')
            append(snapshot.isPlaying)
            append('|')
            append(snapshot.artworkUrl)
            append('|')
            append(artwork?.hashCode() ?: 0)
        }
    }

    private fun requestArtworkIfNeeded(url: String) {
        val normalizedUrl = url.trim()
        if (normalizedUrl.isEmpty()) {
            currentArtworkUrl = ""
            currentArtworkBitmap = null
            pendingArtworkUrl = ""
            return
        }

        if (normalizedUrl == currentArtworkUrl && currentArtworkBitmap != null) {
            pendingArtworkUrl = ""
            return
        }

        currentArtworkUrl = normalizedUrl
        artworkCache.get(normalizedUrl)?.let { bitmap ->
            currentArtworkBitmap = bitmap
            pendingArtworkUrl = ""
            lastFailedArtworkUrl = ""
            lastFailedArtworkAtMs = 0L
            return
        }

        if (pendingArtworkUrl == normalizedUrl) return

        val now = SystemClock.elapsedRealtime()
        if (lastFailedArtworkUrl == normalizedUrl && now - lastFailedArtworkAtMs < ARTWORK_RETRY_BACKOFF_MS) {
            return
        }

        currentArtworkBitmap = null
        pendingArtworkUrl = normalizedUrl
        artworkExecutor.execute {
            val decoded = decodeArtwork(normalizedUrl)
            if (decoded != null) {
                artworkCache.put(normalizedUrl, decoded)
            }
            mainHandler.post {
                if (currentArtworkUrl != normalizedUrl) return@post
                pendingArtworkUrl = ""
                if (decoded == null) {
                    lastFailedArtworkUrl = normalizedUrl
                    lastFailedArtworkAtMs = SystemClock.elapsedRealtime()
                } else {
                    lastFailedArtworkUrl = ""
                    lastFailedArtworkAtMs = 0L
                }
                currentArtworkBitmap = decoded
                val snapshot = latestSnapshot?.normalize() ?: return@post
                updateMetadata(snapshot, decoded)
                if (shouldRenderNotification(snapshot)) {
                    maybePublishNotification(snapshot, decoded, force = true)
                }
            }
        }
    }

    private fun decodeArtwork(url: String): Bitmap? {
        return if (url.startsWith("data:image", ignoreCase = true)) {
            decodeDataUriArtwork(url)
        } else {
            decodeHttpArtwork(url)
        }
    }

    private fun decodeDataUriArtwork(dataUri: String): Bitmap? {
        return try {
            val commaIndex = dataUri.indexOf(',')
            if (commaIndex <= 0 || commaIndex >= dataUri.length - 1) return null
            val encoded = dataUri.substring(commaIndex + 1)
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Exception) {
            null
        }
    }

    private fun decodeHttpArtwork(url: String): Bitmap? {
        var connection: HttpURLConnection? = null
        return try {
            connection = URL(url).openConnection() as? HttpURLConnection
            connection?.connectTimeout = 3000
            connection?.readTimeout = 3000
            connection?.instanceFollowRedirects = true
            connection?.doInput = true
            connection?.connect()
            if (connection?.responseCode !in 200..299) return null
            connection?.inputStream.use { stream ->
                if (stream == null) return null
                BitmapFactory.decodeStream(stream)
            }
        } catch (_: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun publishNotification(snapshot: PlaybackSnapshot, artwork: Bitmap?) {
        if (!canPostNotifications()) return
        visibleNotificationTrackId = snapshot.trackId
        notificationVisible = true

        val previousIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
            context,
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
        )
        val playPauseIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
            context,
            if (snapshot.isPlaying) PlaybackStateCompat.ACTION_PAUSE else PlaybackStateCompat.ACTION_PLAY
        )
        val nextIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
            context,
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT
        )

        val playPauseLabel = if (snapshot.isPlaying) {
            context.getString(R.string.media_action_pause)
        } else {
            context.getString(R.string.media_action_play)
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(snapshot.title.ifBlank { context.getString(R.string.app_name) })
            .setContentText(snapshot.artist.ifBlank { context.getString(R.string.app_name) })
            .setSubText(snapshot.album.ifBlank { context.getString(R.string.app_name) })
            .setLargeIcon(artwork)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(snapshot.isPlaying)
            .setContentIntent(buildLaunchPendingIntent())
            .setDeleteIntent(
                MediaButtonReceiver.buildMediaButtonPendingIntent(
                    context,
                    PlaybackStateCompat.ACTION_PAUSE
                )
            )
            .setStyle(
                MediaAppNotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .addAction(
                android.R.drawable.ic_media_previous,
                context.getString(R.string.media_action_previous),
                previousIntent
            )
            .addAction(
                if (snapshot.isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                playPauseLabel,
                playPauseIntent
            )
            .addAction(
                android.R.drawable.ic_media_next,
                context.getString(R.string.media_action_next),
                nextIntent
            )

        notificationManager.notify(NOTIFICATION_ID, builder.build())
    }

    private fun hideNotification() {
        notificationVisible = false
        lastNotificationSignature = ""
        notificationManager.cancel(NOTIFICATION_ID)
    }

    private fun canPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.POST_NOTIFICATIONS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun buildLaunchPendingIntent() = run {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        android.app.PendingIntent.getActivity(
            context,
            3101,
            launchIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.media_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = context.getString(R.string.media_channel_description)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun applyOptimisticSeek(positionMs: Long) {
        val snapshot = latestSnapshot ?: return
        val duration = if (snapshot.durationMs > 0L) snapshot.durationMs else Long.MAX_VALUE
        val clamped = min(max(0L, positionMs), duration)
        val optimistic = snapshot.copy(positionMs = clamped, timestampMs = System.currentTimeMillis())
        latestSnapshot = optimistic
        updatePlaybackState(optimistic)
        if (shouldRenderNotification(optimistic)) {
            maybePublishNotification(optimistic, currentArtworkBitmap)
        }
    }
}

private data class PlaybackSnapshot(
    val reason: String,
    val source: String,
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String,
    val artworkUrl: String,
    val isPlaying: Boolean,
    val localPlaying: Boolean,
    val onlinePlaying: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val speed: Double,
    val timestampMs: Long
) {
    fun normalize(): PlaybackSnapshot {
        val normalizedDuration = durationMs.coerceAtLeast(0L)
        val normalizedPosition = if (normalizedDuration > 0L) {
            positionMs.coerceIn(0L, normalizedDuration)
        } else {
            positionMs.coerceAtLeast(0L)
        }
        return copy(
            positionMs = normalizedPosition,
            durationMs = normalizedDuration,
            speed = if (speed > 0.0) speed else 1.0
        )
    }

    companion object {
        fun fromJson(rawJson: String): PlaybackSnapshot? {
            return try {
                val json = JSONObject(rawJson)
                PlaybackSnapshot(
                    reason = json.optString("reason", ""),
                    source = json.optString("source", "local"),
                    trackId = json.optString("trackId", ""),
                    title = json.optString("title", ""),
                    artist = json.optString("artist", ""),
                    album = json.optString("album", ""),
                    artworkUrl = json.optString("artworkUrl", ""),
                    isPlaying = json.optBoolean("isPlaying", false),
                    localPlaying = json.optBoolean("localPlaying", false),
                    onlinePlaying = json.optBoolean("onlinePlaying", false),
                    positionMs = json.optLong("positionMs", 0L),
                    durationMs = json.optLong("durationMs", 0L),
                    speed = json.optDouble("speed", 1.0),
                    timestampMs = json.optLong("timestampMs", System.currentTimeMillis())
                )
            } catch (_: Exception) {
                null
            }
        }
    }
}
