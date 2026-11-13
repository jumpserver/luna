import { computed } from "vue";

export const useClientAccountHandoff = () => {
  const notice = useState<string | null>("client-expired-session-notice", () => null);
  const handoff = useState<{ site: string; status: "pending" | "retry" } | null>(
    "client-expired-session-handoff",
    () => null
  );
  const active = computed(() => notice.value !== null || handoff.value !== null);

  return { notice, handoff, active };
};
