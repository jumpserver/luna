import { computed, readonly, shallowRef } from "vue";

const serverEnabled = shallowRef(false);
const localEnabled = shallowRef(false);
export const serverWorkspaceAiEnabled = readonly(serverEnabled);
export const workspaceAiEnabled = computed(() => serverEnabled.value || localEnabled.value);
export function setWorkspaceAiEnabled(value: boolean) {
  serverEnabled.value = value;
}
export function setLocalCodexEnabled(value: boolean) {
  localEnabled.value = value;
}
