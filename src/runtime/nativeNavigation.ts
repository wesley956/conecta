import { App as CapacitorApp } from '@capacitor/app';
import { useAppStore } from '@/stores/appStore';
import { isNativeRuntime } from '@/utils/nativeRuntime';
import type { AppState } from '@/types';

const ROOT_SCREENS = new Set<AppState>([
  'home',
  'splash',
  'activation',
  'expired',
  'blocked',
  'nointernet',
]);

const INVALID_BACK_DESTINATIONS = new Set<AppState>([
  'player',
  'splash',
  'activation',
  'expired',
  'blocked',
  'nointernet',
]);

let installed = false;

function dispatchApplicationBack() {
  const event = new KeyboardEvent('keydown', {
    key: 'GoBack',
    code: 'BrowserBack',
    bubbles: true,
    cancelable: true,
  });

  return !window.dispatchEvent(event) || event.defaultPrevented;
}

function getSafePreviousScreen(currentScreen: AppState, previousScreen: AppState | null) {
  if (
    previousScreen &&
    previousScreen !== currentScreen &&
    !INVALID_BACK_DESTINATIONS.has(previousScreen)
  ) {
    return previousScreen;
  }

  return currentScreen === 'home' ? null : 'home';
}

async function handleNativeBack() {
  // Primeiro oferece o evento aos painéis locais, detalhes e ao player. Esses
  // componentes chamam preventDefault quando realmente consumiram o voltar.
  if (dispatchApplicationBack()) return;

  const { currentScreen, previousScreen, setScreen } = useAppStore.getState();

  if (ROOT_SCREENS.has(currentScreen)) {
    await CapacitorApp.minimizeApp();
    return;
  }

  const destination = getSafePreviousScreen(currentScreen, previousScreen);

  if (destination) {
    setScreen(destination);
  } else {
    await CapacitorApp.minimizeApp();
  }
}

export function installNativeNavigation() {
  if (installed || !isNativeRuntime()) return;
  installed = true;

  void CapacitorApp.addListener('backButton', () => {
    void handleNativeBack();
  });
}

installNativeNavigation();
