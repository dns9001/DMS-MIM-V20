import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
});
