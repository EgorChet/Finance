import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "./assets/theme.css";
import "./assets/desktop.css";
import { hydratePaceSettings } from "./shared/settings/paceSettingsSync";
import { userIdFromToken } from "./shared/utils/users";

/** The launch screen draws the logo in about 2 s. Every launch keeps it up until the drawing is done and the finished
 *  logo has been on screen for a moment, even when the app is ready sooner. Reduced motion drops it at once. */
const BOOT_HOLD_MS = 2800;
function finishBoot() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const wait = calm ? 0 : Math.max(0, BOOT_HOLD_MS - performance.now());
  window.setTimeout(() => {
    boot.classList.add("boot--out");
    window.setTimeout(() => boot.remove(), 600);
  }, wait);
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
