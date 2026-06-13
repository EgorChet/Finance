import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "login", component: () => import("../views/LoginView.vue") },
    {
      path: "/app",
      component: () => import("../layouts/AppShell.vue"),
      children: [
        { path: "", redirect: "/app/overview" },
        { path: "overview", name: "overview", component: () => import("../views/OverviewView.vue") },
        { path: "review", name: "review", component: () => import("../views/ReviewView.vue") },
        { path: "excluded", name: "excluded", component: () => import("../views/ExcludedView.vue") },
        { path: "recurring", name: "recurring", component: () => import("../views/FixedChargesView.vue") },
        { path: "mappings", name: "mappings", component: () => import("../views/MappingsView.vue") },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.authRequired && to.path === "/") {
    try {
      await auth.checkStatus();
    } catch {
      /* offline */
    }
  }
  if (to.path.startsWith("/app") && auth.authRequired && !auth.isAuthenticated && !auth.isDemo) {
    return "/";
  }
  if (to.path === "/" && auth.isAuthenticated) {
    return "/app/overview";
  }
  return true;
});

export default router;
