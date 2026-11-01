import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ListView } from "./ui/ListView";
import { ui } from "./ui/store";
import { readPlayer } from "./engine/actions";
import { live } from "./art/live";
import "./styles.css";

// Lets headless tests drive the UI state (browsers there can't capture the mouse).
if (import.meta.env.DEV) {
  Object.assign(window, { __museum: { ui, live, position: () => readPlayer(), look: () => readPlayer() } });
}

/** The 3D museum needs WebGPU or WebGL 2 (three falls back from one to the other). */
const can3d = () => "gpu" in navigator || !!document.createElement("canvas").getContext("webgl2");
const list = location.pathname === "/list";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {list || !can3d() ? <ListView unsupported={!list} /> : <App />}
  </StrictMode>,
);
