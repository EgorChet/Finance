import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "./assets/theme.css";
import "./assets/desktop.css";
import { hydratePaceSettings } from "./shared/settings/paceSettingsSync";
import { userIdFromToken } from "./shared/utils/users";

/** The launch screen draws the logo in about 2 s. A cold start keeps it up until the drawing is done, even if the app is ready sooner;
 *  a reload in the same session (or reduced motion) drops it at once. */
const BOOT_DRAW_MS = 2000;
function finishBoot() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  let seen = false;
  try {
    seen = sessionStorage.getItem("boot_seen") === "1";
    sessionStorage.setItem("boot_seen", "1");
  } catch {
    /* private mode: treat every launch as a first one */
  }
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const wait = seen || calm ? 0 : Math.max(0, BOOT_DRAW_MS - performance.now());
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
