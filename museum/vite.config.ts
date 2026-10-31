import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    // Share the lab's local D1/R2 state, so exhibits made in the local lab show up here.
    // A different inspector port, so the lab and the museum can run side by side.
    cloudflare({ persistState: { path: "../.wrangler/state" }, inspectorPort: 9230 }),
  ],
  server: { port: 5200 },
});
