import { Capacitor } from '@capacitor/core';

interface CapacitorRuntimeBridge {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

function readPlatform(
  bridge?: CapacitorRuntimeBridge,
) {
  try {
    return String(
      bridge?.getPlatform?.() || '',
    ).toLowerCase();
  } catch {
    return '';
  }
}

function readNativeStatus(
  bridge?: CapacitorRuntimeBridge,
) {
  try {
    return Boolean(
      bridge?.isNativePlatform?.(),
    );
  } catch {
    return false;
  }
}

function getWindowCapacitor():
  | CapacitorRuntimeBridge
  | undefined {

  if (typeof window === 'undefined') {
    return undefined;
  }

  return (
    window as typeof window & {
      Capacitor?: CapacitorRuntimeBridge;
    }
  ).Capacitor;
}

export function isNativeRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }

  const importedCapacitor =
    Capacitor as unknown as CapacitorRuntimeBridge;

  const windowCapacitor =
    getWindowCapacitor();

  const importedPlatform =
    readPlatform(importedCapacitor);

  const windowPlatform =
    readPlatform(windowCapacitor);

  return (
    importedPlatform === 'android' ||
    importedPlatform === 'ios' ||
    windowPlatform === 'android' ||
    windowPlatform === 'ios' ||
    readNativeStatus(importedCapacitor) ||
    readNativeStatus(windowCapacitor)
  );
}
