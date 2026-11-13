import { reactive } from "vue";

/** One short message at the bottom of the screen, optionally with an action ("Undo"). */
export const toastState = reactive<{ message: string; action: string; id: number }>({ message: "", action: "", id: 0 });
let actionFn: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, action?: { label: string; run: () => void }, ms = 5000): void {
  toastState.message = message;
  toastState.action = action?.label ?? "";
  toastState.id += 1;
  actionFn = action?.run ?? null;
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideToast, ms);
}

export function hideToast(): void {
  toastState.message = "";
  toastState.action = "";
  actionFn = null;
}

export function runToastAction(): void {
  const fn = actionFn;
  hideToast();
  fn?.();
}
