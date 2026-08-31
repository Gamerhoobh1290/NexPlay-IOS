/** @import { Track } from './types.js' */

export class PlaybackEngine {
    #isGraphConnected = false;
    /**
     * @param {HTMLMediaElement} mediaElement
     */
    constructor(mediaElement) {
        this.media = mediaElement;

        this.abLoop = {
            enabled: false,
            start: 0,
            end: 0
        };

        /** @type {{ title: string, time: number }[]} */
        this.chapters = [];

        this.replayGainDb = 0;
        this.targetLufs = -14;
        this.normalizationEnabled = false;

        this.audioContext = null;
        this.mediaSource = null;
        this.gainNode = null;
        this.analyser = null;

        this.preloadedNext = null;

        this.media.addEventListener('timeupdate', () => {
            this.#enforceAbLoop();
        });
    }

    /**
     * @param {Track[]} tracks
     * @param {string|null} currentTrackId
     * @param {{isShuffle:boolean, repeatMode:'none'|'all'|'one', queue:string[], shuffleQueue:string[], shuffleIndex:number}} queueState
     * @returns {string|null}
     */
    getNextTrackId(tracks, currentTrackId, queueState) {
        if (!Array.isArray(tracks) || tracks.length === 0) return null;

        if (queueState.queue && queueState.queue.length > 0) {
            return queueState.queue[0] || null;
        }

        if (queueState.isShuffle) {
            const pool = queueState.shuffleQueue && queueState.shuffleQueue.length ? queueState.shuffleQueue : tracks.map((track) => track.id);
            const currentIndex = pool.indexOf(currentTrackId || '');
            if (currentIndex >= 0 && currentIndex < pool.length - 1) {
                return pool[currentIndex + 1] || null;
            }
            if (queueState.repeatMode === 'all') {
                return pool[0] || null;
            }
            return queueState.repeatMode === 'one' ? currentTrackId : null;
        }

        const index = tracks.findIndex((track) => track.id === currentTrackId);
        if (index === -1) return tracks[0].id;
        if (index < tracks.length - 1) return tracks[index + 1].id;
        if (queueState.repeatMode === 'all') return tracks[0].id;
        return queueState.repeatMode === 'one' ? currentTrackId : null;
    }

    /**
     * @param {number} nextSpeed
     */
    setPlaybackSpeed(nextSpeed) {
        const value = Math.max(0.25, Math.min(2.5, Number(nextSpeed) || 1));
        this.media.playbackRate = value;
        return value;
    }

    /**
     * @param {number} nextVolume
     */
    setVolume(nextVolume) {
        const value = Math.max(0, Math.min(1, Number(nextVolume) || 0));
        this.media.volume = value;
        return value;
    }

    togglePlay() {
        if (this.media.paused) {
            return this.media.play();
        }
        this.media.pause();
        return Promise.resolve();
    }

    /**
     * @param {number} startSeconds
     * @param {number} endSeconds
     */
    setAbLoop(startSeconds, endSeconds) {
        const start = Math.max(0, Number(startSeconds) || 0);
        const end = Math.max(start, Number(endSeconds) || 0);
        if (end <= start) {
            this.clearAbLoop();
            return this.abLoop;
        }

        this.abLoop = {
            enabled: true,
            start,
            end
        };
        return this.abLoop;
    }

    clearAbLoop() {
        this.abLoop = {
            enabled: false,
            start: 0,
            end: 0
        };
        return this.abLoop;
    }

    getAbLoop() {
        return { ...this.abLoop };
    }

    /**
     * @param {{title:string,time:number}[]} chapters
     */
    setChapterMarkers(chapters) {
        const normalized = (Array.isArray(chapters) ? chapters : [])
            .map((chapter) => ({
                title: String(chapter && chapter.title ? chapter.title : 'Chapter'),
                time: Math.max(0, Number(chapter && chapter.time ? chapter.time : 0))
            }))
            .sort((a, b) => a.time - b.time);

        this.chapters = normalized;
        return this.chapters.slice();
    }

    getChapterMarkers() {
        return this.chapters.slice();
    }

    getCurrentChapterIndex(currentTime = this.media.currentTime || 0) {
        if (!this.chapters.length) return -1;
        let index = 0;
        for (let i = 0; i < this.chapters.length; i += 1) {
            if (currentTime >= this.chapters[i].time) {
                index = i;
            }
        }
        return index;
    }

    seekToChapter(index) {
        const chapter = this.chapters[index];
        if (!chapter) return false;
        this.media.currentTime = chapter.time;
        return true;
    }

    /**
     * ReplayGain / loudness normalization approximation.
     * @param {number} gainDb
     */
    setReplayGainDb(gainDb) {
        this.replayGainDb = Number(gainDb) || 0;
        this.#applyNormalizationGain();
        return this.replayGainDb;
    }

    /**
     * @param {boolean} enabled
     * @param {number=} targetLufs
     */
    setLoudnessNormalization(enabled, targetLufs = -14) {
        this.normalizationEnabled = Boolean(enabled);
        this.targetLufs = Number(targetLufs) || -14;
        this.#applyNormalizationGain();
        return {
            enabled: this.normalizationEnabled,
            targetLufs: this.targetLufs,
            replayGainDb: this.replayGainDb
        };
    }

    /**
     * Lightweight gapless hook: preloads next media URL to reduce transition latency.
     * @param {string} url
     */
    preloadNextTrack(url) {
        if (!url) {
            this.preloadedNext = null;
            return null;
        }

        const probe = document.createElement(this.media.tagName.toLowerCase());
        probe.preload = 'auto';
        probe.src = url;
        this.preloadedNext = {
            url,
            element: probe,
            loadedAt: Date.now()
        };
        return this.preloadedNext;
    }

    swapToPreloadedTrack() {
        if (!this.preloadedNext || !this.preloadedNext.url) return false;
        this.media.src = this.preloadedNext.url;
        this.preloadedNext = null;
        return true;
    }

    getPreloadedTrack() {
        return this.preloadedNext ? { ...this.preloadedNext } : null;
    }

    /**
     * Returns a short, normalized waveform sample snapshot from the currently playing stream.
     * @param {number=} size
     */
    getWaveformSnapshot(size = 96) {
        const analyser = this.#ensureAnalyser();
        if (!analyser) return [];

        const sampleSize = Math.max(16, Math.min(512, Number(size) || 96));
        const data = new Uint8Array(sampleSize);
        analyser.getByteTimeDomainData(data);

        return Array.from(data).map((value) => (value - 128) / 128);
    }

    #enforceAbLoop() {
        if (!this.abLoop.enabled) return;
        if (!Number.isFinite(this.media.currentTime)) return;
        if (this.media.currentTime >= this.abLoop.end) {
            this.media.currentTime = this.abLoop.start;
        }
    }

    #ensureAnalyser() {
        try {
            if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
                return null;
            }

            const Context = window.AudioContext || window.webkitAudioContext;
            if (!this.audioContext) {
                this.audioContext = new Context();
            }
            if (!this.mediaSource) {
                this.mediaSource = this.audioContext.createMediaElementSource(this.media);
            }
            if (!this.gainNode) {
                this.gainNode = this.audioContext.createGain();
            }
            if (!this.analyser) {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 1024;
            }

            if (!this.#isGraphConnected) {
                this.mediaSource.connect(this.gainNode);
                this.gainNode.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                this.#isGraphConnected = true;
            }

            return this.analyser;
        } catch (_) {
            return null;
        }
    }

    #applyNormalizationGain() {
        const analyser = this.#ensureAnalyser();
        if (!analyser || !this.gainNode) return;

        if (!this.normalizationEnabled) {
            this.gainNode.gain.value = 1;
            return;
        }

        // ReplayGain dB to linear gain.  Positive values amplify, negative attenuate.
        const gainLinear = Math.pow(10, this.replayGainDb / 20);
        this.gainNode.gain.value = Math.max(0.1, Math.min(3, gainLinear));
    }
}

