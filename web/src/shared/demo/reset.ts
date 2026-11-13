import { confirm } from "@/shared/composables/useConfirm";
import { t } from "@/shared/i18n";
import { resetDemo } from "./backend";

/** Ask, forget every demo edit, and reload so every screen starts from the original household. */
export async function resetDemoAndReload(): Promise<void> {
  const ok = await confirm({
    title: t("Reset the demo?"),
    message: t("Everything you changed in the demo goes back to the original sample data."),
    confirmLabel: t("Reset demo"),
    tone: "danger",
  });
  if (!ok) return;
  resetDemo();
  window.location.reload();
}
