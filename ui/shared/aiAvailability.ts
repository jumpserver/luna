import { readonly, shallowRef } from "vue";

const serverEnabled = shallowRef(false);
export const serverWorkspaceAiEnabled = readonly(serverEnabled);
export const workspaceAiEnabled = serverWorkspaceAiEnabled;
export function setWorkspaceAiEnabled(value: boolean) {
  serverEnabled.value = value;
}
