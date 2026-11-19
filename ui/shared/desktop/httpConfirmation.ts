import { readonly, shallowRef } from "vue";

type HttpConnectionCommand = "auth_login" | "bootstrap_auth_session";

const pending = shallowRef<{ origin: string; command: HttpConnectionCommand } | null>(null);
let confirmation: Promise<boolean> | null = null;
let resolveConfirmation: ((accepted: boolean) => void) | null = null;

export const pendingHttpConnection = readonly(pending);

export function finishHttpConnectionConfirmation(accepted = false) {
  const resolve = resolveConfirmation;
  pending.value = null;
  confirmation = null;
  resolveConfirmation = null;
  resolve?.(accepted);
}

export function cancelHttpLoginConfirmation() {
  if (pending.value?.command === "auth_login") finishHttpConnectionConfirmation();
}

export function requestHttpConnectionConfirmation(origin: string, command: HttpConnectionCommand) {
  if (pending.value?.origin === origin && pending.value.command === command && confirmation) return confirmation;
  finishHttpConnectionConfirmation();
  pending.value = { origin, command };
  confirmation = new Promise<boolean>((resolve) => {
    resolveConfirmation = resolve;
  });
  return confirmation;
}
