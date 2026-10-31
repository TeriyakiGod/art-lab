import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ui } from "./ui/store";
import { IsLocal, Look, Position, world } from "./engine/ecs";
import "./styles.css";

// Lets headless tests drive the UI state (browsers there can't capture the mouse).
if (import.meta.env.DEV) {
  const local = () => world.queryFirst(IsLocal);
  Object.assign(window, { __museum: { ui, position: () => local()?.get(Position), look: () => local()?.get(Look) } });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
