// RonecaPlayTV - TV Layout Component
// Optimized for TV Box, Android TV, Google TV with remote control navigation

import React, { useEffect, useState } from 'react';
import { cn } from '../utils/helpers';
import type { Notice } from '../types';

interface TVLayoutProps {
  children: React.ReactNode;
  className?: string;
  showHeader?: boolean;
  showNotice?: boolean;
  notice?: Notice | null;
}

export function TVLayout({ 
  children, 
  className, 
  showHeader = true,
  showNotice = false,
  notice = null,
}: TVLayoutProps) {
  const [currentTime, setCurrentTime] = useState<string>('');

  // Update time every minute
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle remote control navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus management for TV remote
      const focusableElements = document.querySelectorAll('.focusable');
      const currentIndex = Array.from(focusableElements).findIndex(
        el => el === document.activeElement
      );

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < focusableElements.length - 1) {
            (focusableElements[currentIndex + 1] as HTMLElement)?.focus();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > 0) {
            (focusableElements[currentIndex - 1] as HTMLElement)?.focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          // Find next row element
          const nextRow = findNextRowElement(currentIndex, focusableElements, 'down');
          if (nextRow) nextRow.focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevRow = findNextRowElement(currentIndex, focusableElements, 'up');
          if (prevRow) prevRow.focus();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          (document.activeElement as HTMLElement)?.click();
          break;
        case 'Backspace':
        case 'Escape':
          // Handle back navigation
          window.history.back();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={cn(
      'min-h-screen bg-bg-primary text-text-primary tv-mode',
      'bg-pattern',
      className
    )}>
      {/* Header */}
      {showHeader && (
        <header className="fixed top-0 left-0 right-0 z-50 px-8 py-4 bg-gradient-to-b from-bg-primary/95 to-transparent">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-orange to-neon-cyan flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 4h16v16H4z" opacity="0.3"/>
                  <path d="M8 8h8v8H8z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gradient">RonecaPlayTV</h1>
                <p className="text-xs text-text-muted">IPTV Player</p>
              </div>
            </div>

            {/* Right side info */}
            <div className="flex items-center gap-6">
              {/* Notice indicator */}
              {showNotice && notice && (
                <div className="flex items-center gap-2 px-4 py-2 bg-bg-card rounded-lg border border-border-default">
                  <div className="w-2 h-2 rounded-full bg-neon-orange animate-pulse" />
                  <span className="text-sm text-text-secondary">{notice.title}</span>
                </div>
              )}
              
              {/* Time */}
              <div className="text-xl font-semibold text-text-secondary">
                {currentTime}
              </div>
              
              {/* Connection status */}
              <div className="flex items-center gap-2 px-3 py-2 bg-bg-card rounded-lg">
                <svg className="w-5 h-5 text-neon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                  <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                  <circle cx="12" cy="20" r="1" fill="currentColor"/>
                </svg>
                <span className="text-sm text-neon-green">Online</span>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Notice Banner */}
      {showNotice && notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4">
          <div className="bg-bg-card border border-neon-orange rounded-lg p-4 shadow-glow animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-neon-orange/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-neon-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-neon-orange mb-1">{notice.title}</h3>
                <p className="text-sm text-text-secondary">{notice.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={cn(
        'pt-24 pb-8 px-8',
        showNotice && notice ? 'mt-32' : ''
      )}>
        {children}
      </main>

      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-64 w-128 h-128 bg-neon-orange/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-64 w-128 h-128 bg-neon-cyan/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}

// Helper function to find next row element for vertical navigation
function findNextRowElement(
  currentIndex: number, 
  elements: NodeListOf<Element>, 
  direction: 'up' | 'down'
): HTMLElement | null {
  if (currentIndex === -1) return elements[0] as HTMLElement;
  
  const currentElement = elements[currentIndex] as HTMLElement;
  if (!currentElement) return null;
  
  const currentRect = currentElement.getBoundingClientRect();
  const elementsArray = Array.from(elements) as HTMLElement[];
  
  let bestMatch: HTMLElement | null = null;
  let bestDistance = Infinity;
  
  for (let i = 0; i < elementsArray.length; i++) {
    if (i === currentIndex) continue;
    
    const element = elementsArray[i];
    const rect = element.getBoundingClientRect();
    
    const isVerticalMatch = direction === 'down' 
      ? rect.top > currentRect.bottom - 20
      : rect.bottom < currentRect.top + 20;
    
    if (isVerticalMatch) {
      const horizontalDistance = Math.abs(
        rect.left - currentRect.left
      );
      
      const verticalDistance = direction === 'down'
        ? rect.top - currentRect.bottom
        : currentRect.top - rect.bottom;
      
      if (horizontalDistance < 200 && verticalDistance < bestDistance) {
        bestDistance = verticalDistance;
        bestMatch = element;
      }
    }
  }
  
  return bestMatch;
}
