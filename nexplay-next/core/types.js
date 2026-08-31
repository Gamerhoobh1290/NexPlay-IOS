/**
 * @typedef {'audio' | 'video'} MediaType
 */

/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {MediaType} type
 * @property {string=} url
 * @property {number=} duration
 * @property {number=} size
 * @property {number=} addedAt
 * @property {boolean=} isFavorite
 * @property {string=} cover
 * @property {string[]=} tags
 * @property {number=} playCount
 * @property {string=} fingerprint
 * @property {string=} fileName
 * @property {string=} customLyrics
 * @property {number=} updatedAt
 */

/**
 * @typedef {Object} Playlist
 * @property {string} id
 * @property {string} name
 * @property {string[]} tracks
 * @property {number=} updatedAt
 */

/**
 * @typedef {Object} QueueState
 * @property {string[]} queue
 * @property {'auto' | 'manual'} queueSource
 * @property {boolean} isShuffle
 * @property {'none' | 'all' | 'one'} repeatMode
 * @property {string[]} shuffleQueue
 * @property {number} shuffleIndex
 */

/**
 * @typedef {Object} PlaybackState
 * @property {string|null} currentTrackId
 * @property {boolean} isPlaying
 * @property {number} volume
 * @property {number} playbackSpeed
 * @property {boolean} windowedModeActive
 * @property {boolean} fsModeActive
 * @property {boolean} videoFsModeActive
 */

/**
 * @typedef {Object} UserSettings
 * @property {string} accentColor
 * @property {boolean} autoAccentFromArt
 * @property {boolean} isDarkMode
 * @property {'list' | 'grid'} viewMode
 * @property {'date' | 'name' | 'size'} sortType
 * @property {'asc' | 'desc'} sortDirection
 * @property {string} visualizerStyle
 */

/**
 * @typedef {Object} LyricsEntry
 * @property {string} key
 * @property {string} raw
 * @property {'lrc' | 'plain'} format
 * @property {'manual' | 'auto'} kind
 * @property {string} provider
 * @property {number} savedAt
 * @property {number=} updatedAt
 */

/**
 * @typedef {Object} SyncRecord
 * @property {string} entity
 * @property {string} entityId
 * @property {number} updatedAt
 * @property {'pending' | 'synced' | 'conflicted'} status
 */

/**
 * @typedef {'on_track_end' | 'on_import_complete' | 'on_app_start' | 'scheduled_time'} AutomationTriggerType
 */

/**
 * @typedef {'enqueue_filter' | 'set_speed' | 'toggle_mode' | 'apply_tags' | 'start_playlist'} AutomationActionType
 */

/**
 * @typedef {Object} AutomationTrigger
 * @property {AutomationTriggerType} type
 * @property {Object<string, any>=} config
 */

/**
 * @typedef {Object} AutomationAction
 * @property {AutomationActionType} type
 * @property {Object<string, any>=} payload
 */

/**
 * @typedef {Object} AutomationRule
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 * @property {number} priority
 * @property {AutomationTrigger} trigger
 * @property {AutomationAction[]} actions
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} AppState
 * @property {Track[]} tracks
 * @property {Playlist[]} playlists
 * @property {QueueState} queue
 * @property {PlaybackState} playback
 * @property {UserSettings} settings
 * @property {string[]} history
 * @property {Object<string, LyricsEntry>} lyrics
 * @property {AutomationRule[]} automationRules
 * @property {Object<string, any>} metadata
 * @property {number} version
 */

export {};
