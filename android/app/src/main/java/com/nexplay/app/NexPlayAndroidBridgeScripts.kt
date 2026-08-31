package com.nexplay.app

import java.util.Locale

internal object NexPlayAndroidBridgeScripts {
    val installPlaybackBridge: String = """
        (function installNexPlayAndroidBridge() {
          if (window.__nexplayAndroidBridgeInstalled) return;
          window.__nexplayAndroidBridgeInstalled = true;

          var bridge = window.NexPlayAndroid;
          if (!bridge || typeof bridge.onPlaybackSnapshot !== 'function') return;
          var PLAYBACK_TICK_INTERVAL_MS = 150;
          var PLAYING_POSITION_BUCKET_MS = 125;

          function getLegacy() {
            return window.NexPlayLegacy || null;
          }

          function getStateSafe() {
            try {
              var legacy = getLegacy();
              if (legacy && typeof legacy.getState === 'function') return legacy.getState() || {};
              if (typeof state !== 'undefined' && state) return state;
            } catch (_) {}
            return {};
          }

          function getElementsSafe() {
            try {
              var legacy = getLegacy();
              if (legacy && typeof legacy.getElements === 'function') return legacy.getElements() || {};
              if (typeof els !== 'undefined' && els) return els;
            } catch (_) {}
            return {};
          }

          function getCurrentTrackSafe() {
            try {
              if (typeof getActivePlaybackTrack === 'function') return getActivePlaybackTrack();
              var legacy = getLegacy();
              if (legacy && typeof legacy.getCurrentTrack === 'function') return legacy.getCurrentTrack();
            } catch (_) {}
            return null;
          }

          function getOnlineStateSafe() {
            try {
              if (typeof getOnlineMusicState === 'function') return getOnlineMusicState() || {};
            } catch (_) {}
            return {};
          }

          function getOnlinePlayerSnapshotSafe() {
            try {
              if (typeof getOnlineMusicPlayerSnapshot === 'function') return getOnlineMusicPlayerSnapshot() || {};
            } catch (_) {}
            return {};
          }

          function enforceSingleSource(localPlaying, onlinePlaying, source) {
            if (!(localPlaying && onlinePlaying)) return;
            try {
              if (source === 'online-music') {
                if (typeof stopLocalMediaTransport === 'function') {
                  stopLocalMediaTransport({ resetTime: false });
                  return;
                }
                var localAudio = getElementsSafe().audio;
                if (localAudio && !localAudio.paused) localAudio.pause();
                return;
              }
              if (typeof deactivateOnlineMusicTransport === 'function') {
                deactivateOnlineMusicTransport({
                  nextPlaybackSource: 'local',
                  stopPlayer: true,
                  resetTime: false
                });
                return;
              }
              if (typeof stopSharedOnlineMusicPlayback === 'function') {
                stopSharedOnlineMusicPlayback();
              }
            } catch (_) {}
          }

          function createSnapshot(reason) {
            var stateRef = getStateSafe();
            var source = stateRef && stateRef.currentPlaybackSource === 'online-music'
              ? 'online-music'
              : 'local';
            var track = getCurrentTrackSafe();
            var audio = getElementsSafe().audio;
            var localPlaying = !!(audio && !audio.paused && !audio.ended && !!audio.src);
            var onlineState = getOnlineStateSafe();
            var onlinePlaying = !!(onlineState && onlineState.currentTrackId && onlineState.isPlaying);
            enforceSingleSource(localPlaying, onlinePlaying, source);

            var isPlaying = false;
            var positionMs = 0;
            var durationMs = 0;
            var speed = 1;

            if (source === 'online-music') {
              var onlineSnapshot = getOnlinePlayerSnapshotSafe();
              var rawOnlinePosition = (onlineSnapshot && onlineSnapshot.currentTime != null)
                ? Number(onlineSnapshot.currentTime)
                : Number(onlineState.currentTime || 0);
              var rawOnlineDuration = (onlineSnapshot && onlineSnapshot.duration != null)
                ? Number(onlineSnapshot.duration)
                : Number(onlineState.duration || (track && track.duration) || 0);
              positionMs = Math.max(0, Math.round((isFinite(rawOnlinePosition) ? rawOnlinePosition : 0) * 1000));
              durationMs = Math.max(0, Math.round((isFinite(rawOnlineDuration) ? rawOnlineDuration : 0) * 1000));
              isPlaying = (typeof onlineSnapshot.isPlaying === 'boolean')
                ? !!onlineSnapshot.isPlaying
                : onlinePlaying;
              speed = 1;
            } else {
              var rawLocalPosition = Number((audio && audio.currentTime) || 0);
              var rawLocalDuration = Number((audio && audio.duration) || (track && track.duration) || 0);
              var rawSpeed = Number((audio && audio.playbackRate) || 1);
              positionMs = Math.max(0, Math.round((isFinite(rawLocalPosition) ? rawLocalPosition : 0) * 1000));
              durationMs = Math.max(0, Math.round((isFinite(rawLocalDuration) ? rawLocalDuration : 0) * 1000));
              isPlaying = !!(audio && !audio.paused && !audio.ended);
              speed = isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
            }

            return {
              reason: reason || 'tick',
              source: source,
              trackId: String((track && track.id) || ''),
              title: String((track && track.title) || ''),
              artist: String((track && track.artist) || ''),
              album: source === 'online-music' ? 'NexPlay Online' : 'NexPlay',
              artworkUrl: String((track && track.cover) || ''),
              isPlaying: !!isPlaying,
              localPlaying: !!localPlaying,
              onlinePlaying: !!onlinePlaying,
              positionMs: positionMs,
              durationMs: durationMs,
              speed: speed,
              timestampMs: Date.now()
            };
          }

          function buildSnapshotSignature(snapshot) {
            var rawPosition = Number(snapshot && snapshot.positionMs) || 0;
            var positionBucket = snapshot && snapshot.isPlaying
              ? Math.round(rawPosition / PLAYING_POSITION_BUCKET_MS)
              : Math.round(rawPosition);
            return [
              snapshot && snapshot.source,
              snapshot && snapshot.trackId,
              snapshot && snapshot.title,
              snapshot && snapshot.artist,
              snapshot && snapshot.album,
              snapshot && snapshot.artworkUrl,
              snapshot && snapshot.isPlaying ? 1 : 0,
              snapshot && snapshot.localPlaying ? 1 : 0,
              snapshot && snapshot.onlinePlaying ? 1 : 0,
              positionBucket,
              Number(snapshot && snapshot.durationMs) || 0,
              Math.round((Number(snapshot && snapshot.speed) || 1) * 100)
            ].join('|');
          }

          var lastSnapshotSignature = '';
          function emit(reason) {
            var snapshot = createSnapshot(reason);
            var signature = buildSnapshotSignature(snapshot);
            if (signature === lastSnapshotSignature && reason !== 'force') return;
            lastSnapshotSignature = signature;
            try {
              bridge.onPlaybackSnapshot(JSON.stringify(snapshot));
            } catch (_) {}
          }

          function wrapFunction(name, reason) {
            try {
              var fn = window[name];
              if (typeof fn !== 'function' || fn.__nexplayAndroidWrapped) return;
              var wrapped = function() {
                var result = fn.apply(this, arguments);
                emit(reason || name);
                return result;
              };
              wrapped.__nexplayAndroidWrapped = true;
              window[name] = wrapped;
            } catch (_) {}
          }

          window.__nexplayAndroidCommands = {
            play: function() {
              try {
                var stateRef = getStateSafe();
                if (stateRef.currentPlaybackSource === 'online-music') {
                  var onlineState = getOnlineStateSafe();
                  if (!onlineState.isPlaying && typeof toggleOnlineMusicPlayback === 'function') {
                    toggleOnlineMusicPlayback();
                    emit('command-play-online');
                    return;
                  }
                }
                var audio = getElementsSafe().audio;
                if (audio && audio.paused) {
                  if (typeof handoffToLocalPlayback === 'function') {
                    handoffToLocalPlayback({ resetOnlineTime: false });
                  }
                  var attempt = audio.play();
                  if (attempt && typeof attempt.catch === 'function') attempt.catch(function() {});
                  emit('command-play-local');
                  return;
                }
                var legacy = getLegacy();
                if (legacy && typeof legacy.dispatchAction === 'function') {
                  legacy.dispatchAction('play_pause');
                  emit('command-play-toggle');
                }
              } catch (_) {}
            },
            pause: function() {
              try {
                if (typeof pauseActivePlaybackTransport === 'function') {
                  pauseActivePlaybackTransport({ captureProgress: true });
                  emit('command-pause');
                  return;
                }
                var legacy = getLegacy();
                if (legacy && typeof legacy.dispatchAction === 'function') {
                  var stateRef = getStateSafe();
                  if (stateRef.isPlaying) {
                    legacy.dispatchAction('play_pause');
                    emit('command-pause-toggle');
                  }
                }
              } catch (_) {}
            },
            next: function() {
              try {
                var legacy = getLegacy();
                if (legacy && typeof legacy.dispatchAction === 'function') {
                  legacy.dispatchAction('next');
                  emit('command-next');
                }
              } catch (_) {}
            },
            previous: function() {
              try {
                var legacy = getLegacy();
                if (legacy && typeof legacy.dispatchAction === 'function') {
                  legacy.dispatchAction('prev');
                  emit('command-prev');
                }
              } catch (_) {}
            },
            seekToMs: function(positionMs) {
              try {
                var ms = Number(positionMs || 0);
                var seconds = Math.max(0, ms / 1000);
                if (typeof seekActivePlaybackTransport === 'function') {
                  Promise.resolve(
                    seekActivePlaybackTransport(seconds, { forcePersist: true })
                  ).catch(function() {});
                  emit('command-seek');
                  return;
                }
                var audio = getElementsSafe().audio;
                if (audio) {
                  audio.currentTime = seconds;
                  emit('command-seek-local');
                }
              } catch (_) {}
            }
          };

          wrapFunction('updateProgress', 'update-progress');
          wrapFunction('captureOnlineMusicProgress', 'online-progress');
          wrapFunction('togglePlay', 'toggle-play');
          wrapFunction('playNext', 'play-next');
          wrapFunction('playPrev', 'play-prev');
          wrapFunction('loadTrack', 'load-track');
          wrapFunction('stopPlaybackForQueueExhaustion', 'queue-stop');

          var audioRef = getElementsSafe().audio;
          if (audioRef && !audioRef.__nexplayAndroidBridgeEvents) {
            audioRef.__nexplayAndroidBridgeEvents = true;
            ['play', 'pause', 'ended', 'timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'ratechange'].forEach(function(eventName) {
              try {
                audioRef.addEventListener(eventName, function() {
                  emit('audio-' + eventName);
                }, { passive: true });
              } catch (_) {}
            });
          }

          try {
            window.addEventListener('nexplay:track-ended', function() { emit('track-ended'); });
            window.addEventListener('visibilitychange', function() { emit('visibility'); });
          } catch (_) {}

          setInterval(function() {
            emit('tick');
          }, PLAYBACK_TICK_INTERVAL_MS);

          emit('force');
          if (typeof bridge.onBridgeReady === 'function') {
            try {
              bridge.onBridgeReady();
            } catch (_) {}
          }
        })();
    """.trimIndent()

    val playCommand: String = """
        (function() {
          var commands = window.__nexplayAndroidCommands;
          if (commands && typeof commands.play === 'function') commands.play();
        })();
    """.trimIndent()

    val pauseCommand: String = """
        (function() {
          var commands = window.__nexplayAndroidCommands;
          if (commands && typeof commands.pause === 'function') commands.pause();
        })();
    """.trimIndent()

    val nextCommand: String = """
        (function() {
          var commands = window.__nexplayAndroidCommands;
          if (commands && typeof commands.next === 'function') commands.next();
        })();
    """.trimIndent()

    val previousCommand: String = """
        (function() {
          var commands = window.__nexplayAndroidCommands;
          if (commands && typeof commands.previous === 'function') commands.previous();
        })();
    """.trimIndent()

    fun seekToCommand(positionMs: Long): String {
        val clampedMs = positionMs.coerceAtLeast(0)
        val normalizedMs = String.format(Locale.US, "%.0f", clampedMs.toDouble())
        return """
            (function() {
              var commands = window.__nexplayAndroidCommands;
              if (commands && typeof commands.seekToMs === 'function') {
                commands.seekToMs($normalizedMs);
              }
            })();
        """.trimIndent()
    }
}
