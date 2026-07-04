import { onMounted, onUnmounted, ref } from "vue";

declare const __APP_BUILD_ID__: string;

const DISMISS_KEY = "finance-app-update-dismissed";

/** Poll version.json and prompt when a newer build is deployed. */
export function useAppUpdate() {
  const updateAvailable = ref(false);
  let checking = false;

  async function checkForUpdate() {
    if (checking || updateAvailable.value) return;
    checking = true;
    try {
      const url = `${import.meta.env.BASE_URL}version.json`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { build?: string };
      if (!data.build || data.build === __APP_BUILD_ID__) return;
      if (sessionStorage.getItem(DISMISS_KEY) === data.build) return;
      updateAvailable.value = true;
    } catch {
      /* offline or missing version.json */
    } finally {
      checking = false;
    }
  }

  function refreshApp() {
    sessionStorage.removeItem(DISMISS_KEY);
    window.location.reload();
  }

  function dismissUpdate() {
    void fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { build?: string }) => {
        if (data.build) sessionStorage.setItem(DISMISS_KEY, data.build);
      })
      .catch(() => undefined);
    updateAvailable.value = false;
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") void checkForUpdate();
  }

  onMounted(() => {
    void checkForUpdate();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return { updateAvailable, refreshApp, dismissUpdate };
}
