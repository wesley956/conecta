type ConnectionLike = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
};

type NavigatorWithCapabilities = Navigator & {
  deviceMemory?: number;
  connection?: ConnectionLike;
};

let frameId: number | null = null;

function detectFormFactor() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const portrait = height > width;
  const userAgent = navigator.userAgent.toLowerCase();
  const looksLikeTv = /android tv|google tv|smarttv|smart-tv|aft|bravia|netcast|web0s|tizen/.test(userAgent);

  if (looksLikeTv) return 'tv';
  if (Math.min(width, height) >= 700) return 'tablet';
  if (Math.min(width, height) < 700) return 'phone';
  return portrait ? 'tablet' : 'desktop';
}

function detectPerformanceClass() {
  const capabilities = navigator as NavigatorWithCapabilities;
  const memory = capabilities.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const effectiveType = capabilities.connection?.effectiveType?.toLowerCase();
  const constrainedNetwork = capabilities.connection?.saveData || effectiveType === 'slow-2g' || effectiveType === '2g';

  if (constrainedNetwork || (memory !== undefined && memory <= 2) || (cores > 0 && cores <= 4)) {
    return 'low';
  }

  return 'normal';
}

function applyRuntimeProfile() {
  const root = document.documentElement;
  root.dataset.formFactor = detectFormFactor();
  root.dataset.performance = detectPerformanceClass();
  root.dataset.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

function scheduleProfileUpdate() {
  if (frameId !== null) return;

  frameId = window.requestAnimationFrame(() => {
    frameId = null;
    applyRuntimeProfile();
  });
}

export function installAdaptiveRuntime() {
  applyRuntimeProfile();

  window.addEventListener('resize', scheduleProfileUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleProfileUpdate, { passive: true });

  const connection = (navigator as NavigatorWithCapabilities).connection;
  connection?.addEventListener('change', scheduleProfileUpdate);
}

installAdaptiveRuntime();
