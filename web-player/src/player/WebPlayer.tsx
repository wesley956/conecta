import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import type { WebChannel } from '../types';

type Props = ComponentProps<typeof import('./WebPlayerCore').WebPlayer>;

const LazyWebPlayerCore = lazy(async () => {
  const module = await import('./WebPlayerCore');
  return { default: module.WebPlayer };
});

export function WebPlayer(props: Props) {
  const progressRef = useRef(props.onProgress);
  const switchRef = useRef(props.onSwitchChannel);
  const closeRef = useRef(props.onClose);

  useEffect(() => { progressRef.current = props.onProgress; }, [props.onProgress]);
  useEffect(() => { switchRef.current = props.onSwitchChannel; }, [props.onSwitchChannel]);
  useEffect(() => { closeRef.current = props.onClose; }, [props.onClose]);

  const onProgress = useCallback((position: number, duration: number) => {
    progressRef.current?.(position, duration);
  }, []);
  const onSwitchChannel = useCallback((channel: WebChannel) => {
    switchRef.current?.(channel);
  }, []);
  const onClose = useCallback(() => {
    closeRef.current();
  }, []);

  return (
    <Suspense fallback={(
      <div className="player-overlay" role="status" aria-live="polite">
        <div className="player-status">Preparando reprodução…</div>
      </div>
    )}>
      <LazyWebPlayerCore
        {...props}
        onProgress={props.onProgress ? onProgress : undefined}
        onSwitchChannel={props.onSwitchChannel ? onSwitchChannel : undefined}
        onClose={onClose}
      />
    </Suspense>
  );
}
