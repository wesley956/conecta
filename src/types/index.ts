// ===== RonecaPlayTV Types =====

// Device types
export type DeviceType = 'celular' | 'tablet' | 'tvbox' | 'androidtv' | 'googletv' | 'smarttv';

// UI Mode
export type UIMode = 'tv' | 'mobile';

// App states
export type AppState = 'splash' | 'activation' | 'expired' | 'blocked' | 'nointernet' | 'home' | 'channels' | 'movies' | 'series' | 'player' | 'favorites' | 'search' | 'settings' | 'channel_detail' | 'movie_detail' | 'series_detail';

// Channel
export interface Channel {
  id: string;
  name: string;
  logo?: string;
  groupTitle?: string;
  group: string;
  url?: string;
  epgId?: string;
  isFavorite?: boolean;
  playbackUrls?: string[];
}

// Channel Category
export interface ChannelCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

// Movie
export interface Movie {
  id: string;
  name: string;
  year: number;
  duration: string;
  synopsis: string;
  cover?: string;
  category: string;
  url?: string;
  isFavorite?: boolean;
  progress?: number; // 0-100
  playbackUrls?: string[];
}

// Series
export interface Series {
  id: string;
  name: string;
  cover?: string;
  category: string;
  synopsis: string;
  seasons: Season[];
  isFavorite?: boolean;
  progress?: number;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  number: number;
  name: string;
  url: string;
  duration: string;
  progress?: number;
  playbackUrls?: string[];
}

// EPG
export interface EPGProgram {
  channelId: string;
  title: string;
  description: string;
  start: string;
  end: string;
}

// Playlist
export interface Playlist {
  id: string;
  name: string;
  type: 'm3u' | 'xtream' | 'stalker' | 'local';
  url?: string;
  status: 'active' | 'inactive' | 'error';
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  lastSync?: string;
}

// Customer
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'expired' | 'blocked';
  planId: string;
  expiresAt: string;
  deviceCount: number;
  notes?: string;
  createdAt: string;
}

// Device (admin)
export interface Device {
  id: string;
  deviceCode: string;
  deviceType: DeviceType;
  customerId?: string;
  customerName?: string;
  status: 'active' | 'blocked' | 'pending';
  lastSeenAt: string;
  ip?: string;
  appVersion: string;
  createdAt: string;
}

// Plan
export interface Plan {
  id: string;
  name: string;
  price: number;
  maxDevices: number;
  durationDays: number;
  status: 'active' | 'inactive';
}

// Subscription
export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  startsAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'cancelled';
}

// Notice
export interface Notice {
  id: string;
  title: string;
  message: string;
  target: 'all' | string;
  active: boolean;
  createdAt: string;
}

// Log Entry
export interface LogEntry {
  id: string;
  actorType: 'admin' | 'system' | 'customer';
  actorId: string;
  action: string;
  metadata?: string;
  createdAt: string;
}

// Watch History
export interface WatchHistory {
  id: string;
  contentType: 'channel' | 'movie' | 'episode';
  contentId: string;
  name: string;
  thumbnail?: string;
  progress?: number;
  watchedAt: string;
  seasonNum?: number;
  episodeNum?: number;
}

// App Settings
export interface AppSettings {
  playerType: 'native' | 'vlc' | 'mxplayer' | 'auto';
  decoding: 'hardware' | 'software' | 'auto';
  bufferSize: 'low' | 'medium' | 'high';
  autoReconnect: boolean;
  language: 'pt' | 'en' | 'es';
  p2pEnabled: boolean;
  p2pWifiOnly: boolean;
  p2pUploadLimit: number;
  animationsEnabled: boolean;
  cardSize: 'small' | 'medium' | 'large';
}

// Admin View
export type AdminView = 'dashboard' | 'customers' | 'devices' | 'plans' | 'notices' | 'logs' | 'settings';
