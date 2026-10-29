import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Workers AI always runs remotely and needs `wrangler login`.
    // CF_LOCAL=1 runs fully offline (everything except the assistant works).
    cloudflare({ remoteBindings: process.env.CF_LOCAL !== "1" }),
    VitePWA({
      registerType: "autoUpdate",
      // Cloudflare Access sits in front of the app; without cookies the manifest fetch gets the login redirect.
      useCredentials: true,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Art Lab",
        short_name: "Art Lab",
        description: "A personal lab for algorithmic art",
        theme_color: "#121214",
        background_color: "#121214",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/agents\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Output images never change, so keep them; the output list prefers fresh data but works offline.
        runtimeCaching: [
          {
            urlPattern: /\/api\/outputs\/[^/]+\/image$/,
            handler: "CacheFirst",
            options: { cacheName: "output-images", expiration: { maxEntries: 500 } },
          },
          {
            urlPattern: /\/api\/outputs(\?.*)?$/,
            handler: "NetworkFirst",
            options: { cacheName: "output-lists", networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
});
