import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';

// ===== LAYOUT COMPONENTS =====

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { uiMode, activeNotice } = useAppStore();
  
  return (
    <div className={`h-full w-full bg-bg-primary bg-pattern overflow-hidden flex flex-col ${uiMode === 'tv' ? 'tv-safe' : 'mobile-safe'}`}>
      {/* Notice Banner */}
      {activeNotice && (
        <div className="bg-neon-orange/10 border border-neon-orange/30 text-neon-orange px-4 py-2 rounded-lg mb-3 text-sm flex items-center justify-between animate-fade-in">
          <span>{activeNotice}</span>
          <button onClick={() => useAppStore.getState().setActiveNotice(null)} className="ml-4 text-white/60 hover:text-white">
            ✕
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ===== HEADER =====

export function Header({ title, showBack, onBack, showAdmin, showSearch, showUser }: {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  showAdmin?: boolean;
  showSearch?: boolean;
  showUser?: boolean;
}) {
  const { setScreen, setAdminMode, uiMode } = useAppStore();
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const formatTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  return (
    <header className={`flex items-center justify-between mb-4 ${uiMode === 'tv' ? 'mb-6' : 'mb-3'}`}>
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={onBack || (() => setScreen('home'))} className="text-text-gray hover:text-neon-orange transition-colors p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        )}
        {title ? (
          <h1 className={`${uiMode === 'tv' ? 'text-2xl' : 'text-lg'} font-bold text-text-white`}>{title}</h1>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-neon-orange text-2xl font-extrabold tracking-wider glow-orange-text">RONECA</span>
            <span className="text-neon-cyan text-2xl font-extrabold tracking-wider glow-cyan-text">PLAY</span>
            <span className="text-text-gray text-sm font-medium ml-1">TV</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {showSearch && (
          <button onClick={() => setScreen('search')} className="text-text-gray hover:text-neon-cyan transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
        )}
        {showAdmin && (
          <button onClick={() => setAdminMode(true)} className="text-text-gray hover:text-neon-orange transition-colors text-sm border border-border px-3 py-1 rounded-lg hover:border-neon-orange">
            ⚙️ Admin
          </button>
        )}
        <div className="flex items-center gap-2 text-text-gray text-sm">
          <span className="text-active-green">●</span>
          <span>Online</span>
        </div>
        <span className={`${uiMode === 'tv' ? 'text-lg' : 'text-sm'} text-text-gray font-mono`}>{formatTime(time)}</span>
        {showUser && (
          <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-neon-orange text-sm font-bold">
            U
          </div>
        )}
      </div>
    </header>
  );
}

// ===== NEON CARD =====

export function NeonCard({ children, selected, onClick, className, glowColor = 'orange' }: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  glowColor?: 'orange' | 'cyan' | 'green';
}) {
  const glowClasses = {
    orange: selected ? 'border-neon-orange glow-orange' : 'border-border',
    cyan: selected ? 'border-neon-cyan glow-cyan' : 'border-border',
    green: selected ? 'border-active-green' : 'border-border',
  };
  
  return (
    <div
      onClick={onClick}
      className={`
        bg-card rounded-xl border-2 transition-all duration-300 cursor-pointer
        hover:border-neon-orange/50 hover:bg-card-hover
        ${glowClasses[glowColor]}
        ${selected ? 'scale-[1.02]' : ''}
        ${className || ''}
      `}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

// ===== STATUS BADGE =====

export function StatusBadge({ status }: { status: 'active' | 'expired' | 'blocked' | 'inactive' | 'pending' | 'error' }) {
  const styles: Record<string, string> = {
    active: 'bg-active-green/20 text-active-green border-active-green/30',
    expired: 'bg-alert-yellow/20 text-alert-yellow border-alert-yellow/30',
    blocked: 'bg-error-red/20 text-error-red border-error-red/30',
    inactive: 'bg-text-gray/20 text-text-gray border-text-gray/30',
    pending: 'bg-neon-orange/20 text-neon-orange border-neon-orange/30',
    error: 'bg-error-red/20 text-error-red border-error-red/30',
  };
  
  const labels: Record<string, string> = {
    active: 'Ativo',
    expired: 'Vencido',
    blocked: 'Bloqueado',
    inactive: 'Inativo',
    pending: 'Pendente',
    error: 'Erro',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.inactive}`}>
      {labels[status] || status}
    </span>
  );
}

// ===== PROGRESS BAR =====

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={`h-1 bg-border rounded-full overflow-hidden ${className || ''}`}>
      <div className="h-full bg-neon-orange rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
    </div>
  );
}

// ===== SECTION TITLE =====

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { uiMode } = useAppStore();
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className={`${uiMode === 'tv' ? 'text-xl' : 'text-base'} font-bold text-text-white`}>{title}</h2>
      {action && (
        <button onClick={onAction} className="text-neon-orange text-sm hover:text-neon-cyan transition-colors">
          {action} →
        </button>
      )}
    </div>
  );
}

// ===== EMPTY STATE =====

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-bold text-text-white mb-2">{title}</h3>
      <p className="text-text-gray text-sm max-w-md">{description}</p>
    </div>
  );
}

// ===== BOTTOM NAV (Mobile) =====

export function BottomNav() {
  const { currentScreen, setScreen, uiMode } = useAppStore();
  
  if (uiMode !== 'mobile') return null;
  
  const navItems = [
    { screen: 'home' as const, icon: '🏠', label: 'Home' },
    { screen: 'channels' as const, icon: '📺', label: 'Canais' },
    { screen: 'movies' as const, icon: '🎬', label: 'Filmes' },
    { screen: 'series' as const, icon: '🎥', label: 'Séries' },
    { screen: 'settings' as const, icon: '⚙️', label: 'Config' },
  ];
  
  return (
    <nav className="flex items-center justify-around bg-bg-dark border-t border-border py-2 mt-2 -mx-4 px-4">
      {navItems.map(item => (
        <button
          key={item.screen}
          onClick={() => setScreen(item.screen)}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
            currentScreen === item.screen ? 'text-neon-orange' : 'text-text-gray hover:text-text-white'
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ===== SCROLLABLE CONTAINER =====

export function ScrollContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-y-auto overflow-x-hidden custom-scrollbar ${className || ''}`} style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {children}
    </div>
  );
}

// ===== CATEGORY PILLS =====

export function CategoryPills({ categories, selected, onSelect }: {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
            selected === cat
              ? 'bg-neon-orange text-bg-primary shadow-lg glow-orange'
              : 'bg-card border border-border text-text-gray hover:border-neon-orange/50 hover:text-text-white'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

// ===== LEGAL BANNER =====

export function LegalBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  
  return (
    <div className="bg-bg-dark border border-border rounded-xl p-4 mb-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-alert-yellow text-lg">⚖️</span>
          <p className="text-text-gray text-xs leading-relaxed">
            <strong className="text-alert-yellow">Aviso Legal:</strong> RonecaPlayTV é um player legal. Não fornece canais, filmes ou listas piratas. 
            Use apenas conteúdo autorizado. O uso indevido é de responsabilidade do usuário.
          </p>
        </div>
        <button onClick={() => setVisible(false)} className="text-text-gray hover:text-white text-sm">✕</button>
      </div>
    </div>
  );
}

// ===== VIRTUAL KEYBOARD (TV Mode) =====

export function VirtualKeyboard({ value, onChange, onSearch }: {
  value: string;
  onChange: (val: string) => void;
  onSearch: () => void;
}) {
  const rows = [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
    ['U', 'V', 'W', 'X', 'Y', 'Z', '⌫', '🔍'],
  ];
  
  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar canais, filmes, séries..."
          className="flex-1 bg-card border border-border rounded-lg px-4 py-3 text-text-white placeholder-text-gray/50 focus:border-neon-orange focus:outline-none"
        />
        <button onClick={onSearch} className="bg-neon-orange text-bg-primary px-6 py-3 rounded-lg font-bold hover:bg-neon-orange/80 transition-colors">
          Buscar
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {row.map(key => (
              <button
                key={key}
                onClick={() => {
                  if (key === '⌫') onChange(value.slice(0, -1));
                  else if (key === '🔍') onSearch();
                  else onChange(value + key);
                }}
                className={`w-10 h-10 rounded-lg font-bold text-sm transition-all duration-200 ${
                  key === '🔍'
                    ? 'bg-neon-orange text-bg-primary w-16'
                    : 'bg-card border border-border text-text-white hover:border-neon-orange hover:bg-card-hover'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
