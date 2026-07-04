import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "login", component: () => import("@/features/auth/LoginView.vue") },
    {
      path: "/app",
      component: () => import("@/shared/layouts/AppShell.vue"),
      children: [
        { path: "", redirect: { name: "home" } },
        { path: "home", name: "home", component: () => import("@/features/home/HomeView.vue") },
        { path: "overview", name: "overview", component: () => import("@/features/spending/SpendingView.vue") },
        { path: "calendar", name: "calendar", component: () => import("@/features/calendar/CalendarView.vue") },
        { path: "browse", name: "browse", component: () => import("@/features/browse/BrowseView.vue") },
        { path: "merchants", name: "merchants", component: () => import("@/features/merchants/MerchantsView.vue") },
        { path: "review", redirect: { name: "merchants" } },
        { path: "mappings", redirect: { name: "merchants", query: { tab: "mappings" } } },
        { path: "household", name: "household", component: () => import("@/features/household/HouseholdView.vue") },
        { path: "chat", name: "chat", component: () => import("@/features/assistant/ChatView.vue") },
        { path: "recurring", redirect: { name: "household" } },
        { path: "excluded", redirect: { name: "household", hash: "#excluded" } },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.name === "login" || to.path === "/") {
    try {
      await auth.checkStatus();
    } catch {
      /* offline — login page shows a connection error when needed */
    }
  }
  if (to.path.startsWith("/app") && auth.authRequired && !auth.isAuthenticated && !auth.isDemo) {
    return { name: "login", query: { signin: "1" } };
  }
  if ((to.name === "login" || to.path === "/") && auth.isAuthenticated) {
    return { name: "home" };
  }
  return true;
});

export default router;
