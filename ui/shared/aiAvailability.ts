import { readonly, shallowRef } from "vue";

const enabled = shallowRef(false);
export const workspaceAiEnabled = readonly(enabled);

export function setWorkspaceAiEnabled(value: boolean) {
  enabled.value = value;
}
