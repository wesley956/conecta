import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./experience.css";
import "./parity.css";
import "./brand.css";
import "./content.css";
import "./navigation.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);