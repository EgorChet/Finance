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

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Pace settings live on the server; load them (briefly) before the first screen renders.
const savedToken = localStorage.getItem("finance_auth_token");
hydratePaceSettings(savedToken, !savedToken, userIdFromToken(savedToken) !== "julia").finally(() => {
  app.mount("#app");
  finishBoot();
});
