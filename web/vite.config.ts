import { copyFileSync } from "fs";
import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const pagesBase = process.env.GITHUB_PAGES_BASE?.replace(/\/?$/, "/") || "/Finance/";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "gh-pages-spa-fallback",
      closeBundle() {
        if (process.env.GITHUB_PAGES !== "true") return;
        const dist = path.resolve(__dirname, "dist");
        copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));
      },
    },
  ],
  base: process.env.GITHUB_PAGES === "true" ? pagesBase : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
