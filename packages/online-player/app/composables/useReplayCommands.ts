import type { Replay, ReplayCommand } from "#online-player/types";
import { fetchReplayCommands } from "#online-player/api/replay";
import { mapReplayCommands } from "#online-player/utils/replay";

export function useReplayCommands(
  replay: MaybeRefOrGetter<Replay | null>,
  dateStart?: MaybeRefOrGetter<string | undefined>
) {
  const commands = ref<ReplayCommand[]>([]);
  const loading = ref(false);
  const finished = ref(false);
  const page = ref(0);
  const error = ref("");

  const currentDateStart = () => toValue(dateStart) || toValue(replay)?.date_start;

  const loadPage = async (nextPage: number) => {
    const current = toValue(replay);
    if (!current?.id || loading.value || finished.value) return;

    loading.value = true;
    error.value = "";

    try {
      const data = await fetchReplayCommands(current.id, nextPage);
      const incoming = mapReplayCommands(data.results || [], currentDateStart());
      commands.value = nextPage === 0 ? incoming : commands.value.concat(incoming);
      page.value = nextPage;
      finished.value = incoming.length < 30;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause || "");
      if (nextPage === 0) finished.value = true;
    } finally {
      loading.value = false;
    }
  };

  const resetAndLoad = () => {
    commands.value = [];
    page.value = 0;
    finished.value = false;
    error.value = "";
    if (toValue(replay)?.id) void loadPage(0);
  };

  watch(
    () => ({
      id: toValue(replay)?.id || "",
      dateStart: currentDateStart() || ""
    }),
    (current, previous) => {
      if (!current.id) {
        commands.value = [];
        page.value = 0;
        finished.value = false;
        error.value = "";
        return;
      }

      if (previous?.id === current.id && previous.dateStart !== current.dateStart) {
        commands.value = mapReplayCommands(commands.value, current.dateStart);
        return;
      }

      if (previous?.id === current.id) return;
      resetAndLoad();
    },
    { immediate: true }
  );

  return {
    commands,
    loading,
    finished,
    error,
    loadMore: () => loadPage(page.value + 1),
    reload: resetAndLoad
  };
}
