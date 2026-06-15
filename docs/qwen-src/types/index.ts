// RonecaPlayTV - Type Definitions

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'blocked' | 'pending';
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  customer_id: string | null;
  device_code: string;
  device_type: 'mobile' | 'tablet' | 'tvbox' | 'android_tv' | 'google_tv';
  app_version: string;
  status: 'active' | 'blocked' | 'pending';
  last_seen_at: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  max_devices: number;
  duration_days: number;
  status: 'active' | 'inactive';
}

export interface Subscription {
  id: string;
  customer_id: string;
  plan_id: string;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'cancelled';
}

export interface Playlist {
  id: string;
  name: string;
  type: 'm3u' | 'xtream' | 'stalker' | 'local';
  url_or_config: string;
  status: 'active' | 'inactive';
  channels_count?: number;
  movies_count?: number;
  series_count?: number;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  logo?: string;
  category: string;
  stream_url: string;
  epg?: EPGProgram[];
  is_favorite: boolean;
}

export interface Movie {
  id: string;
  title: string;
  year: number;
  duration: number;
  cover?: string;
  description: string;
  category: string;
  stream_url: string;
  is_favorite: boolean;
  progress?: number;
}

export interface Series {
  id: string;
  title: string;
  year: number;
  cover?: string;
  description: string;
  category: string;
  seasons: Season[];
  is_favorite: boolean;
  progress?: { season: number; episode: number; progress: number };
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface Episode {
  number: number;
  title: string;
  duration: number;
  stream_url: string;
  progress?: number;
}

export interface EPGProgram {
  title: string;
  description: string;
  start: string;
  end: string;
  progress: number;
}

export interface Notice {
  id: string;
  title: string;
  message: string;
  target: 'all' | 'customer' | 'device';
  target_id?: string;
  active: boolean;
  created_at: string;
}

export interface WatchHistory {
  id: string;
  device_id: string;
  type: 'channel' | 'movie' | 'series';
  content_id: string;
  content_name: string;
  progress: number;
  watched_at: string;
}

export interface Favorite {
  id: string;
  device_id: string;
  type: 'channel' | 'movie' | 'series' | 'category';
  content_id: string;
  created_at: string;
}

export interface AppSettings {
  player: 'native' | 'vlc' | 'mx' | 'auto';
  decoding: 'hardware' | 'software' | 'auto';
  buffer: 'low' | 'medium' | 'high';
  language: 'pt' | 'en' | 'es';
  p2p_enabled: boolean;
  p2p_wifi_only: boolean;
  p2p_upload_limit: number;
  theme: 'dark_neon';
  card_size: 'small' | 'medium' | 'large';
  animations: boolean;
}

export interface DeviceActivation {
  device_code: string;
  status: 'pending' | 'approved' | 'blocked';
  message?: string;
}
