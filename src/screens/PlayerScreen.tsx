import { PlayerCinematicPanels } from '@/components/player/PlayerCinematicPanels';
import { PlayerCinematicRemoteBridge } from '@/components/player/PlayerCinematicRemoteBridge';
import { PlayerRemoteController } from '@/components/player/PlayerRemoteController';
import { PlayerStabilityController } from '@/components/player/PlayerStabilityController';
import { PlayerV2Screen } from './PlayerV2Screen';
import '@/styles/player-stability.css';
import '@/styles/player-cinematic.css';
import '@/styles/player-cinematic-panels.css';
import '@/styles/player-cinematic-polish.css';
import '@/styles/player-runtime-performance.css';

export function PlayerScreen() {
  return (
    <>
      <PlayerCinematicRemoteBridge />
      <PlayerRemoteController />
      <PlayerCinematicPanels />
      <PlayerV2Screen />
      <PlayerStabilityController />
    </>
  );
}
