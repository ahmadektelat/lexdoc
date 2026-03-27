import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
export default defineConfig({
  server: {
    host: "::",
    port: 5173,
  },
  plugins: [
    {
      name: "serve-app-html",
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            // Serve app.html for all non-asset routes (SPA fallback)
            if (
              req.url &&
              !req.url.startsWith("/@") &&
              !req.url.startsWith("/src") &&
              !req.url.startsWith("/node_modules") &&
              !req.url.includes(".")
            ) {
              req.url = "/app.html";
            }
            next();
          });
        };
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "app.html"),
    },
  },
});
