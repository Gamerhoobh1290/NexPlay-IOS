type NexPlayLooseObject = Record<string, any>;

interface Window {
  NEXPLAY_FLAGS?: NexPlayLooseObject;
  NEXPLAY_SUPABASE_URL?: string;
  NEXPLAY_SUPABASE_ANON_KEY?: string;
  NEXPLAY_SUPABASE_ACCESS_TOKEN?: string;
  NEXPLAY_TELEMETRY_ENDPOINT?: string;
  NEXPLAY_SYNC_PROXY_URL?: string;
  NexPlayLegacy?: any;
  NexPlayNext?: any;
  NexPlayOps?: any;
  NexPlaySecurity?: any;
  showToast?: (message: string, type?: string) => void;
  fetchItunes?: (...args: any[]) => any;
  fetchDeezer?: (...args: any[]) => any;
  fetchLyrics?: (...args: any[]) => any;
  showOpenFilePicker?: (options?: any) => Promise<any[]>;
  webkitAudioContext?: typeof AudioContext;
}

declare var NexPlayAudioQueueHelpers: any;
declare var NexPlayOnlineMusicHelpers: any;
