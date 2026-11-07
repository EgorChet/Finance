import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "./assets/theme.css";
import { hydratePaceSettings } from "./shared/settings/paceSettingsSync";
import { userIdFromToken } from "./shared/utils/users";

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Pace settings live on the server; load them (briefly) before the first screen renders.
const savedToken = localStorage.getItem("finance_auth_token");
hydratePaceSettings(savedToken, !savedToken, userIdFromToken(savedToken) !== "julia").finally(() => app.mount("#app"));
