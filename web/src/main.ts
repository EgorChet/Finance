import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "./assets/theme.css";
import "./assets/desktop.css";
import { hydratePaceSettings } from "./shared/settings/paceSettingsSync";
import { userIdFromToken } from "./shared/utils/users";
import { whenSettled } from "./shared/utils/whenSettled";

/** The launch screen draws the logo in about 2 s. Every launch keeps it up until the drawing is done and the finished
 *  logo has been on screen for a moment, and then until the first screen has its data (no skeleton loaders left),
 *  but at most BOOT_MAX_MS so a slow server never keeps the user on the logo. Reduced motion drops it at once. */
const BOOT_HOLD_MS = 2800;
const BOOT_MAX_MS = 9000;
async function finishBoot() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!calm) {
    const now = performance.now();
    await whenSettled(Math.max(0, BOOT_HOLD_MS - now), Math.max(0, BOOT_MAX_MS - now));
  }
  boot.classList.add("boot--out");
  window.setTimeout(() => boot.remove(), 600);
}

/** A screen's code is fetched when its tab is first used. After a new deploy an open app still points at the old
 *  files, which are gone, so the tap does nothing and the tab "sticks". Reload once to pick up the new build
 *  (not more than once in 30 s, so a real outage cannot loop). */
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem("chunk_reload_at") || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem("chunk_reload_at", String(Date.now()));
  } catch {
    /* private mode: reload anyway */
  }
  window.location.reload();
}
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  reloadOnce();
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
router.onError((err) => {
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String((err as Error)?.message ?? err))) reloadOnce();
});

// Pace settings live on the server; load them (briefly) before the first screen renders.
const savedToken = localStorage.getItem("finance_auth_token");
hydratePaceSettings(savedToken, !savedToken, userIdFromToken(savedToken) !== "julia").finally(() => {
  app.mount("#app");
  finishBoot();
});
