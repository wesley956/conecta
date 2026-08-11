export type SmartTvPerformanceTier = "legacy" | "standard" | "modern";

export type SmartTvPerformanceProfile = {
  tier: SmartTvPerformanceTier;
  chromiumMajor: number | null;
  catalogPageSize: number;
  episodePageSize: number;
  searchLimitPerKind: number;
  imageRootMarginPx: number;
};

function parseChromiumMajor(userAgent: string) {
  const match = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function resolvePerformanceProfile(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): SmartTvPerformanceProfile {
  const chromiumMajor = parseChromiumMajor(userAgent);
  const isWebOs = /Web0S|webOS/i.test(userAgent);

  if (isWebOs && (chromiumMajor == null || chromiumMajor <= 53)) {
    return {
      tier: "legacy",
      chromiumMajor,
      catalogPageSize: 30,
      episodePageSize: 18,
      searchLimitPerKind: 10,
      imageRootMarginPx: 140
    };
  }

  if (isWebOs && chromiumMajor != null && chromiumMajor <= 94) {
    return {
      tier: "standard",
      chromiumMajor,
      catalogPageSize: 42,
      episodePageSize: 24,
      searchLimitPerKind: 15,
      imageRootMarginPx: 220
    };
  }

  return {
    tier: "modern",
    chromiumMajor,
    catalogPageSize: 60,
    episodePageSize: 36,
    searchLimitPerKind: 20,
    imageRootMarginPx: 320
  };
}

export const SMART_TV_PERFORMANCE_PROFILE = resolvePerformanceProfile();
