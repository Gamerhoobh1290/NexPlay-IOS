const { contextBridge, ipcRenderer } = require('electron');

const ONLINE_TRACK_DOWNLOAD_CHANNEL = 'nexplay:download-online-track';
const ONLINE_TRACK_DOWNLOAD_PROGRESS_CHANNEL = 'nexplay:online-track-download-progress';
const ONLINE_TRACK_RESOLVE_CHANNEL = 'nexplay:resolve-online-track-playback';
const ONLINE_RELEASE_DOWNLOAD_CHANNEL = 'nexplay:download-online-release';
const ONLINE_DOWNLOAD_CANCEL_CHANNEL = 'nexplay:cancel-online-download';
const ONLINE_DOWNLOAD_CLEAR_CHANNEL = 'nexplay:clear-online-download-queue';
const ONLINE_DOWNLOAD_QUEUE_CHANNEL = 'nexplay:online-download-queue-update';
const WATCH_FOLDERS_PICK_CHANNEL = 'nexplay:pick-watch-folders';
const WATCH_FOLDERS_START_CHANNEL = 'nexplay:start-library-watch';
const WATCH_FOLDERS_STOP_CHANNEL = 'nexplay:stop-library-watch';
const WATCH_FOLDERS_SCAN_CHANNEL = 'nexplay:scan-watch-folders';
const WATCH_FOLDERS_UPDATE_CHANNEL = 'nexplay:library-watch-update';
const LOCAL_MEDIA_PICK_CHANNEL = 'nexplay:pick-local-media-files';
const LOCAL_LIBRARY_SAVE_INDEX_CHANNEL = 'nexplay:save-local-library-index';
const LOCAL_LIBRARY_LOAD_INDEX_CHANNEL = 'nexplay:load-local-library-index';
const LOCAL_MEDIA_RESOLVE_PATHS_CHANNEL = 'nexplay:resolve-local-media-paths';

contextBridge.exposeInMainWorld('NexPlayDesktop', {
  isDesktopApp: true,
  /** @type {(...args: any[]) => any} */
  downloadOnlineTrack(payload = {}) {
    return ipcRenderer.invoke(ONLINE_TRACK_DOWNLOAD_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  resolveOnlineTrackPlayback(payload = {}) {
    return ipcRenderer.invoke(ONLINE_TRACK_RESOLVE_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  downloadOnlineRelease(payload = {}) {
    return ipcRenderer.invoke(ONLINE_RELEASE_DOWNLOAD_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  cancelOnlineDownload(jobId) {
    return ipcRenderer.invoke(ONLINE_DOWNLOAD_CANCEL_CHANNEL, jobId);
  },
  /** @type {(...args: any[]) => any} */
  clearOnlineDownloadQueue(mode = 'finished') {
    return ipcRenderer.invoke(ONLINE_DOWNLOAD_CLEAR_CHANNEL, mode);
  },
  /** @type {(...args: any[]) => any} */
  onOnlineTrackDownloadProgress(listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (/** @type {any} */ _event, /** @type {any} */ payload) => listener(payload);
    ipcRenderer.on(ONLINE_TRACK_DOWNLOAD_PROGRESS_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(ONLINE_TRACK_DOWNLOAD_PROGRESS_CHANNEL, wrapped);
    };
  },
  /** @type {(...args: any[]) => any} */
  onOnlineDownloadQueueUpdate(listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (/** @type {any} */ _event, /** @type {any} */ payload) => listener(payload);
    ipcRenderer.on(ONLINE_DOWNLOAD_QUEUE_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(ONLINE_DOWNLOAD_QUEUE_CHANNEL, wrapped);
    };
  },
  /** @type {(...args: any[]) => any} */
  pickWatchFolders() {
    return ipcRenderer.invoke(WATCH_FOLDERS_PICK_CHANNEL);
  },
  /** @type {(...args: any[]) => any} */
  pickLocalMediaFiles() {
    return ipcRenderer.invoke(LOCAL_MEDIA_PICK_CHANNEL);
  },
  /** @type {(...args: any[]) => any} */
  saveLocalLibraryIndex(payload = {}) {
    return ipcRenderer.invoke(LOCAL_LIBRARY_SAVE_INDEX_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  loadLocalLibraryIndex() {
    return ipcRenderer.invoke(LOCAL_LIBRARY_LOAD_INDEX_CHANNEL);
  },
  /** @type {(...args: any[]) => any} */
  resolveLocalMediaPaths(payload = {}) {
    return ipcRenderer.invoke(LOCAL_MEDIA_RESOLVE_PATHS_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  startLibraryWatch(payload = {}) {
    return ipcRenderer.invoke(WATCH_FOLDERS_START_CHANNEL, payload);
  },
  /** @type {(...args: any[]) => any} */
  stopLibraryWatch() {
    return ipcRenderer.invoke(WATCH_FOLDERS_STOP_CHANNEL);
  },
  /** @type {(...args: any[]) => any} */
  scanWatchFoldersNow() {
    return ipcRenderer.invoke(WATCH_FOLDERS_SCAN_CHANNEL);
  },
  /** @type {(...args: any[]) => any} */
  onLibraryWatchUpdate(listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (/** @type {any} */ _event, /** @type {any} */ payload) => listener(payload);
    ipcRenderer.on(WATCH_FOLDERS_UPDATE_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(WATCH_FOLDERS_UPDATE_CHANNEL, wrapped);
    };
  }
});
