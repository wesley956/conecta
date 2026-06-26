import { useCallback, useRef } from 'react';

type LongPressAction = () => void;

export function useLongPressFavorite(delayMs = 650) {
  const timerRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((action: LongPressAction) => {
    clearTimer();
    triggeredRef.current = false;

    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      action();

      try {
        navigator.vibrate?.(35);
      } catch {
        // vibração é opcional
      }
    }, delayMs);
  }, [clearTimer, delayMs]);

  const cancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const consume = useCallback(() => {
    const wasTriggered = triggeredRef.current;
    triggeredRef.current = false;
    return wasTriggered;
  }, []);

  return {
    start,
    cancel,
    consume,
  };
}
