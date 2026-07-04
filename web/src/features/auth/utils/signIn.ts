import type { Router } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth";

/** Navigate to the login screen and ensure auth status is loaded first. */
export async function goToSignIn(router: Router): Promise<void> {
  const auth = useAuthStore();
  try {
    await auth.checkStatus();
  } catch {
    auth.error = "Could not reach the server — check your connection and try again.";
  }
  await router.push({ name: "login", query: { signin: "1" } });
}

export function wantsSignIn(query: Record<string, unknown>): boolean {
  return query.signin === "1" || query.signin === "true";
}

/** Show the password form when the API expects auth or the user asked to sign in. */
export function shouldShowSignInForm(authRequired: boolean, query: Record<string, unknown>): boolean {
  return authRequired || wantsSignIn(query) || Boolean(import.meta.env.VITE_API_URL);
}
