import { reactive } from "vue";

export type ConfirmTone = "default" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

const state = reactive({
  open: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  tone: "default" as ConfirmTone,
});

let resolveFn: ((value: boolean) => void) | null = null;

function applyOptions(options: ConfirmOptions | string) {
  if (typeof options === "string") {
    state.title = "Are you sure?";
    state.message = options;
    state.confirmLabel = "Confirm";
    state.cancelLabel = "Cancel";
    state.tone = "default";
    return;
  }

  const tone = options.tone ?? "default";
  state.title = options.title ?? (tone === "danger" ? "Delete?" : "Are you sure?");
  state.message = options.message;
  state.confirmLabel = options.confirmLabel ?? (tone === "danger" ? "Delete" : "Confirm");
  state.cancelLabel = options.cancelLabel ?? "Cancel";
  state.tone = tone;
}

export function confirm(options: ConfirmOptions | string): Promise<boolean> {
  if (resolveFn) {
    resolveFn(false);
    resolveFn = null;
  }

  applyOptions(options);
  state.open = true;

  return new Promise((resolve) => {
    resolveFn = resolve;
  });
}

export function useConfirmState() {
  function finish(result: boolean) {
    state.open = false;
    resolveFn?.(result);
    resolveFn = null;
  }

  return {
    state,
    accept: () => finish(true),
    cancel: () => finish(false),
  };
}
