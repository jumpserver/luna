import { useCssVar, useElementSize, useMutationObserver } from "@vueuse/core";

export const useNotificationOffsets = () => ({
  bottom: useState("notification-bottom", () => 16),
  policyHeight: useState("notification-policy-height", () => 0)
});

export function useNotificationLayout() {
  const { bottom, policyHeight } = useNotificationOffsets();
  const { toasts } = useToast();
  const statusBar = shallowRef<HTMLElement | null>(null);
  const { height } = useElementSize(statusBar);
  const toastBottom = useCssVar("--app-notification-offset");
  const active = computed(() => import.meta.client && (policyHeight.value > 0 || toasts.value.length > 0));
  const syncStatusBar = () => {
    statusBar.value = active.value ? document.querySelector<HTMLElement>(".workspace-status-footer") : null;
  };
  watch(active, syncStatusBar, { immediate: true, flush: "post" });
  useMutationObserver(() => (active.value ? document.body : undefined), syncStatusBar, {
    childList: true,
    subtree: true
  });
  watchEffect(() => {
    bottom.value = height.value + 16;
    toastBottom.value = `${bottom.value + (policyHeight.value > 0 ? policyHeight.value + 16 : 0)}px`;
  });
  onMounted(syncStatusBar);
  onBeforeUnmount(() => {
    toastBottom.value = "16px";
  });
}
