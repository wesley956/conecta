// RonecaPlayTV - Mobile Layout Component
// Optimized for mobile and tablet with touch navigation

import React, { useState } from 'react';
import { cn, getCurrentTime } from '../utils/helpers';
import { 
  Home, 
  Tv, 
  Film, 
  Tv2, 
  Heart, 
  Settings, 
  List,
  Bell
} from 'lucide-react';
import type { Notice } from '../types';

interface MobileLayoutProps {
  children: React.ReactNode;
  className?: string;
  currentRoute?: string;
  onNavigate?: (route: string) => void;
  showNotice?: boolean;
  notice?: Notice | null;
}

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
};

const navItems: NavItem[] = [
  { id: 'home', label: 'Início', icon: <Home size={24} />, route: '/' },
  { id: 'channels', label: 'Canais', icon: <Tv size={24} />, route: '/channels' },
  { id: 'movies', label: 'Filmes', icon: <Film size={24} />, route: '/movies' },
  { id: 'series', label: 'Séries', icon: <Tv2 size={24} />, route: '/series' },
  { id: 'favorites', label: 'Favoritos', icon: <Heart size={24} />, route: '/favorites' },
  { id: 'playlists', label: 'Listas', icon: <List size={24} />, route: '/playlists' },
  { id: 'settings', label: 'Config', icon: <Settings size={24} />, route: '/settings' },
];

export function MobileLayout({ 
  children, 
  className,
  currentRoute = '/',
  onNavigate,
  showNotice = false,
  notice = null,
}: MobileLayoutProps) {
  const [currentTime] = useState<string>(getCurrentTime());
  const [showNotifications, setShowNotifications] = useState(false);

  const handleNavigate = (route: string) => {
    if (onNavigate) {
      onNavigate(route);
    } else {
      window.history.pushState({}, '', route);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className={cn(
      'min-h-screen bg-bg-primary text-text-primary mobile-mode',
      'bg-pattern',
      className
    )}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-gradient-to-b from-bg-primary/95 to-transparent backdrop-blur-sm">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-orange to-neon-cyan flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16v16H4z" opacity="0.3"/>
                <path d="M8 8h8v8H8z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gradient">RonecaPlayTV</h1>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            {showNotice && notice && (
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg bg-bg-card border border-border-default"
              >
                <Bell size={18} className="text-text-secondary" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-neon-orange rounded-full text-xs flex items-center justify-center">
                  {notice ? '1' : ''}
                </span>
              </button>
            )}
            
            {/* Time */}
            <span className="text-sm font-medium text-text-secondary">
              {currentTime}
            </span>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      {showNotice && notice && showNotifications && (
        <div className="fixed top-16 left-0 right-0 z-40 px-4">
          <div className="bg-bg-card border border-neon-orange rounded-lg p-3 shadow-glow">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-neon-orange/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-neon-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-neon-orange text-sm mb-0.5">{notice.title}</h3>
                <p className="text-xs text-text-secondary">{notice.message}</p>
              </div>
              <button 
                onClick={() => setShowNotifications(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="pt-16 pb-24 px-4">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary/95 backdrop-blur-sm border-t border-border-default">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = currentRoute === item.route;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.route)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all',
                  isActive 
                    ? 'text-neon-orange' 
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>
                {isActive && (
                  <span className="absolute -bottom-0.5 w-8 h-0.5 bg-neon-orange rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-neon-orange/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-neon-cyan/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
