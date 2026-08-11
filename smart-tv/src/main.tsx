import "./legacyCompat";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PlayerAspectControl } from "./player/PlayerAspectControl";
import "./styles.css";
import "./experience.css";
import "./parity.css";
import "./brand.css";
import "./content.css";
import "./detail.css";
import "./player-v2.css";
import "./navigation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PlayerAspectControl />
  </StrictMode>
);