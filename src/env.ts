export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  GAME_ROOM: DurableObjectNamespace;
  NETWORK_ROOM: DurableObjectNamespace;
  ROOM_REGISTRY: DurableObjectNamespace;

  JWT_SECRET: string;
  NETWORK_ENABLED: string;
  DISABLE_IP_LOCK: string;
}

export interface UserProfile {
  id: string;
  name: string;
  secret: string;
  joined: number;
  last_active: number;
  role: string | null;
  friend_requests: string;
  friends: string;
  email: string | null;
  bio: string | null;
  profile_hue: number | null;
  profile_hue2: number | null;
  country: string | null;
  ips: string;
  ng_url: string | null;
  ng_id: string | null;
}

export interface UserStats {
  id: string;
  user_id: string;
  type: string | null;
  points_4k: number;
  points_5k: number;
  points_6k: number;
  points_7k: number;
  points_8k: number;
  points_9k: number;
  avg_acc_4k: number;
  avg_acc_5k: number;
  avg_acc_6k: number;
  avg_acc_7k: number;
  avg_acc_8k: number;
  avg_acc_9k: number;
}

export interface ScoreRow {
  id: string;
  score: number;
  accuracy: number;
  points: number;
  sicks: number;
  goods: number;
  bads: number;
  shits: number;
  misses: number;
  playback_rate: number;
  strum: number;
  keys: number | null;
  category: string | null;
  submitted: number;
  mod_url: string | null;
  song_id: string | null;
  player_id: string | null;
  replay_file_id: string | null;
}

export interface SongRow {
  id: string;
  max_points: number;
}

export interface ClubRow {
  id: string;
  name: string;
  tag: string;
  members: string;
  pending: string;
  leaders: string;
  content: string | null;
  hue: number | null;
  points: number;
  created: number;
}

export interface ModRow {
  id: string;
  images: string;
  keywords: string;
  submitted: number;
  favorited: string;
  favorited_count: number;
  title: string;
  description: string;
  download_hits: number;
  updated: number | null;
}

export interface ModDownloadRow {
  id: string;
  urls: string;
  hits: number;
  size: number;
  mod_id: string;
}

export interface NotificationRow {
  id: string;
  date: number;
  to_user: string;
  title: string;
  content: string | null;
  image: string | null;
  href: string | null;
}

export interface ReportRow {
  id: string;
  content: string;
  submitted: number;
  by: string;
}

export interface SongCommentRow {
  id: string;
  content: string;
  at: number;
  by: string;
  song_id: string;
  submitted: number;
}

export interface UserWarningRow {
  id: string;
  reason: string;
  date: number;
  on_user: string;
  by: string;
}

export interface PersistentData {
  front_messages: Array<{ player: string; message: string }>;
  logged_messages: Array<[string, number]>;
  next_weekly_date: number;
  logged_mod_actions: string[];
}

export interface ReplayData {
  player?: string;
  song: string;
  difficulty: string;
  accuracy: number;
  sicks: number;
  goods: number;
  bads: number;
  shits: number;
  misses: number;
  score: number;
  points: number;
  opponent_mode: boolean;
  beat_time: number;
  chart_hash: string;
  keys: number;
  note_offset: number;
  gameplay_modifiers: any;
  ghost_tapping: boolean;
  rating_offset: number;
  safe_frames: number;
  inputs: Array<Array<any>>;
  version: number;
  mod_url: string;
  songId?: string;
}

export const KEYS_LIST = [4, 5, 6, 7, 8, 9];
