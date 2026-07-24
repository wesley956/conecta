import { platform } from "../platform";
import { Html5Player } from "./html5Player";
import { TizenPlayer } from "./tizenPlayer";
import type { PlayerAdapter, SnapshotListener } from "./types";

export function createPlayer(update: SnapshotListener): PlayerAdapter {
  return platform === "tizen" ? new TizenPlayer(update) : new Html5Player(update);
}
