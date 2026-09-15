import type { MaybeRefOrGetter } from "vue";
import type { AgentSessionState } from "#koko/composables/agent/useAgentSession";
import { useOnline } from "@vueuse/core";
import { computed, toValue } from "vue";

export function useAiConnectionNotice(
  state: MaybeRefOrGetter<AgentSessionState | undefined>,
  running: MaybeRefOrGetter<boolean>
) {
  const online = useOnline();
  const blocked = computed(() => !online.value || toValue(state)?.status === "reconnecting");
  const reconnecting = computed(() => blocked.value && toValue(running));
  const noticeKey = computed(() =>
    blocked.value ? `RightPanel.AIConnection${reconnecting.value ? "Reconnecting" : "Disconnected"}` : ""
  );
  const statusKey = computed(() =>
    blocked.value ? `RightPanel.AIStatus${reconnecting.value ? "Reconnecting" : "Disconnected"}` : ""
  );
  return { blocked, noticeKey, statusKey };
}
