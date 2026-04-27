import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      devOptions: {
        enabled: true
      },
      manifest: {
        name: "Transitly",
        short_name: "Transitly",
        description: "Real-time TTC transit tracker for Toronto. Live departures, nearby stops, service alerts, and smart trip planning.",
        theme_color: "#0d4d45",
        background_color: "#f4efe6",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/mask-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://transitly.kranthi-astakala-ca.workers.dev",
        changeOrigin: true,
        secure: true
      }
    }
  }
});
