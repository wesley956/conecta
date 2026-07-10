import { useLayoutEffect } from 'react';

export function PlayerNextEpisodeRemoteBridge() {
  useLayoutEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      const card = document.querySelector<HTMLElement>('.player-next-episode-card');
      if (!card) return;

      const buttons = card.querySelectorAll<HTMLButtonElement>('button');
      const playNowButton = buttons[0];
      const cancelButton = buttons[1];

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      };

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        stop();
        playNowButton?.click();
        return;
      }

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack') {
        stop();
        cancelButton?.click();
      }
    };

    window.addEventListener('keydown', handleRemoteKey, true);
    return () => window.removeEventListener('keydown', handleRemoteKey, true);
  }, []);

  return null;
}
