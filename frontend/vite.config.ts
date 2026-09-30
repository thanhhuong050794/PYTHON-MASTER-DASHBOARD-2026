import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite (5173) proxy /api → FastAPI (8000) để cookie đăng nhập cùng origin
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});