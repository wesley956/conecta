export type MainDestination =
  | "home"
  | "channels"
  | "movies"
  | "series"
  | "myList"
  | "settings";

export type FocusRegion =
  | "mainNavigation"
  | "header"
  | "search"
  | "categories"
  | "grid"
  | "detailActions"
  | "seasons"
  | "episodes"
  | "recommendations"
  | "playerHeader"
  | "playerControls"
  | "playerProgress"
  | "playerDrawer";

export type TvKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "center"
  | "enter"
  | "numpadEnter"
  | "space"
  | "back"
  | "play"
  | "pause"
  | "playPause"
  | "rewind"
  | "fastForward";

export interface FocusMemory {
  readonly destination: MainDestination;
  readonly region: FocusRegion;
  readonly itemId: string | null;
  readonly category: string | null;
  readonly query: string;
  readonly horizontalIndex: number;
  readonly verticalIndex: number;
}

export interface NavigationState {
  readonly selectedDestination: MainDestination;
  readonly focusByDestination: Readonly<Partial<Record<MainDestination, FocusMemory>>>;
}

export function createNavigationState(
  selectedDestination: MainDestination = "home",
): NavigationState {
  return {
    selectedDestination,
    focusByDestination: {},
  };
}

export function rememberFocus(
  state: NavigationState,
  memory: FocusMemory,
): NavigationState {
  return {
    selectedDestination: memory.destination,
    focusByDestination: {
      ...state.focusByDestination,
      [memory.destination]: memory,
    },
  };
}

export function restoreFocus(
  state: NavigationState,
  destination: MainDestination,
): FocusMemory | null {
  return state.focusByDestination[destination] ?? null;
}

export function isActivationKey(key: TvKey): boolean {
  return key === "center" || key === "enter" || key === "numpadEnter" || key === "space";
}

export function canExitPlayer(key: TvKey, focusedRegion: FocusRegion): boolean {
  return key === "back" || (isActivationKey(key) && focusedRegion === "playerHeader");
}
