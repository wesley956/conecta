import { useCallback, useEffect, useRef } from 'react';
import { WebPlayer as WebPlayerCore } from './WebPlayerCore';
import type { ComponentProps } from 'react';
import type { WebChannel } from '../types';

type Props = ComponentProps<typeof WebPlayerCore>;

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
    <WebPlayerCore
      {...props}
      onProgress={props.onProgress ? onProgress : undefined}
      onSwitchChannel={props.onSwitchChannel ? onSwitchChannel : undefined}
      onClose={onClose}
    />
  );
}
