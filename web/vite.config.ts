import { copyFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const pagesBase = process.env.GITHUB_PAGES_BASE?.replace(/\/?$/, "/") || "/Finance/";
const buildId =
  process.env.GITHUB_SHA?.slice(0, 12) ||
  process.env.RENDER_GIT_COMMIT?.slice(0, 12) ||
  String(Date.now());

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    vue(),
    {
      name: "app-build-version",
      closeBundle() {
        const dist = path.resolve(__dirname, "dist");
        writeFileSync(
          path.join(dist, "version.json"),
          `${JSON.stringify({ build: buildId }, null, 0)}\n`,
        );
      },
    },
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
