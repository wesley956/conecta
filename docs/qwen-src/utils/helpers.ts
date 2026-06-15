// RonecaPlayTV - Utility Functions

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get or create device ID from localStorage
 */
export function getDeviceId(): string {
  const stored = localStorage.getItem('ronecaplaytv_device_id');
  if (stored) return stored;
  
  const newId = generateDeviceId();
  localStorage.setItem('ronecaplaytv_device_id', newId);
  return newId;
}

/**
 * Detect device type
 */
export function detectDeviceType(): 'mobile' | 'tablet' | 'tvbox' | 'android_tv' | 'google_tv' {
  const userAgent = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;
  
  // TV detection
  if (userAgent.includes('tv') || userAgent.includes('smarttv') || userAgent.includes('android tv')) {
    if (userAgent.includes('google')) return 'google_tv';
    return 'android_tv';
  }
  
  // TV Box detection (often reported as Android without mobile indicators)
  if (userAgent.includes('android') && !userAgent.includes('mobile')) {
    if (width > 1024) return 'tvbox';
    return 'tablet';
  }
  
  // Mobile detection
  if (userAgent.includes('mobile')) {
    return 'mobile';
  }
  
  // Tablet detection
  if (width > 768 && width <= 1024) {
    return 'tablet';
  }
  
  // Default to mobile
  return 'mobile';
}

/**
 * Check if device is TV mode
 */
export function isTVMode(): boolean {
  const deviceType = detectDeviceType();
  return ['tvbox', 'android_tv', 'google_tv'].includes(deviceType);
}

/**
 * Format date to Brazilian format
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
  return formatDate(date);
}

/**
 * Calculate days until expiration
 */
export function daysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  const exp = new Date(expirationDate);
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format duration in seconds to HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check internet connection
 */
export async function checkInternetConnection(): Promise<boolean> {
  try {
    await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Get current time formatted
 */
export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Validate M3U URL format
 */
export function isValidM3uUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract categories from M3U content
 */
export function extractCategoriesFromM3U(m3uContent: string): string[] {
  const categories = new Set<string>();
  const groupTitleRegex = /#EXTINF:.*group-title="([^"]*)"/g;
  
  let match;
  while ((match = groupTitleRegex.exec(m3uContent)) !== null) {
    if (match[1]) {
      categories.add(match[1]);
    }
  }
  
  return Array.from(categories).sort();
}

/**
 * Parse M3U content to channels
 */
export function parseM3U(m3uContent: string) {
  const lines = m3uContent.split('\n');
  const channels: Array<{
    name: string;
    logo?: string;
    group: string;
    url: string;
  }> = [];
  
  let currentChannel: Partial<typeof channels[0]> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,(.+)$/);
      const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/);
      const groupMatch = trimmed.match(/group-title="([^"]*)"/);
      
      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1] : 'Uncategorized',
      };
    } else if (trimmed && !trimmed.startsWith('#') && currentChannel.name) {
      channels.push({
        name: currentChannel.name,
        logo: currentChannel.logo,
        group: currentChannel.group || 'Uncategorized',
        url: trimmed,
      });
      currentChannel = {};
    }
  }
  
  return channels;
}
