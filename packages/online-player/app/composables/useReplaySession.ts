import type { Replay, ReplayLoadStatus, ReplayWatermarkSettings } from "#online-player/types";
import { ApiRequestError, getPublicSettings } from "#imports";
import {
  fetchReplay,
  fetchReplayAsset,
  fetchReplayProfile,
  fetchReplaySession,
  fetchReplayUser
} from "#online-player/api/replay";
import {
  decideReplayPoll,
  nextReplayPollDelay,
  REPLAY_POLL_MAX_DELAY_MS,
  REPLAY_POLL_MAX_MS,
  REPLAY_POLL_START_DELAY_MS
} from "#online-player/utils/replay";
import { formatLocalDateTime } from "#online-player/utils/time";
import { interpolateWatermark } from "#online-player/utils/watermark";

export function useReplaySession(sessionId: MaybeRefOrGetter<string>) {
  const replay = ref<Replay | null>(null);
  const status = ref<ReplayLoadStatus>("idle");
  const errorMessage = ref("");
  const watermark = ref<ReplayWatermarkSettings | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const clearPoll = () => {
    if (!pollTimer) return;
    clearTimeout(pollTimer);
    pollTimer = null;
  };

  const loadWatermark = async (current: Replay) => {
    try {
      const [settings, profile, session] = await Promise.all([
        getPublicSettings(),
        fetchReplayProfile().catch(() => null),
        fetchReplaySession(current.id).catch(() => null)
      ]);

      if (!settings?.SECURITY_WATERMARK_ENABLED) {
        watermark.value = null;
        return;
      }

      const [sessionUser, asset] = await Promise.all([
        session?.user_id ? fetchReplayUser(session.user_id).catch(() => null) : Promise.resolve(null),
        session?.asset_id ? fetchReplayAsset(session.asset_id).catch(() => null) : Promise.resolve(null)
      ]);

      const viewer = profile?.name
        ? `${profile.name}${profile.username ? `(${profile.username})` : ""}`
        : profile?.username || "";
      const sessionText = interpolateWatermark(String(settings.SECURITY_WATERMARK_SESSION_CONTENT || ""), {
        userId: sessionUser?.id || "",
        name: sessionUser?.name || current.user || "",
        userName: sessionUser?.username || "",
        assetId: asset?.id || "",
        assetName: asset?.name || current.asset || "",
        assetAddress: asset?.address || "",
        currentTime: formatLocalDateTime(new Date().toISOString())
      });

      watermark.value = {
        enabled: true,
        content: [viewer && `${viewer}`, sessionText].filter(Boolean).join("\n"),
        width: Number(settings.SECURITY_WATERMARK_WIDTH) || 300,
        height: Number(settings.SECURITY_WATERMARK_HEIGHT) || 200,
        fontSize: Number(settings.SECURITY_WATERMARK_FONT_SIZE) || 15,
        fontColor: String(settings.SECURITY_WATERMARK_COLOR || "rgba(255,255,255,0.08)"),
        rotate: Number(settings.SECURITY_WATERMARK_ROTATE) || 22
      };
    } catch {
      watermark.value = null;
    }
  };

  const pollReplay = async (startedAt: number, delay: number, token: number) => {
    const sid = toValue(sessionId);
    if (!sid || token !== generation) return;

    try {
      const data = await fetchReplay(sid);
      if (token !== generation) return;

      const decision = decideReplayPoll(data, Date.now() - startedAt, REPLAY_POLL_MAX_MS);
      if (decision === "not-found") {
        status.value = "not-found";
        errorMessage.value = data?.error ? String(data.error) : "";
        return;
      }

      if (decision === "ready") {
        replay.value = { ...data, id: sid };
        status.value = "ready";
        void loadWatermark(replay.value);
        return;
      }

      status.value = "converting";
      pollTimer = setTimeout(
        () => void pollReplay(startedAt, nextReplayPollDelay(delay, REPLAY_POLL_MAX_DELAY_MS), token),
        delay
      );
    } catch (error) {
      if (token !== generation) return;

      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400)) {
        status.value = "not-found";
        errorMessage.value = error.message;
        return;
      }

      status.value = "error";
      errorMessage.value = error instanceof Error ? error.message : String(error || "");
    }
  };

  const load = () => {
    clearPoll();
    generation += 1;
    replay.value = null;
    watermark.value = null;
    errorMessage.value = "";
    status.value = "loading";

    const sid = toValue(sessionId);
    if (!sid) {
      status.value = "not-found";
      return;
    }

    void pollReplay(Date.now(), REPLAY_POLL_START_DELAY_MS, generation);
  };

  watch(() => toValue(sessionId), load, { immediate: true });
  onBeforeUnmount(() => {
    generation += 1;
    clearPoll();
  });

  return {
    replay,
    status,
    errorMessage,
    watermark,
    reload: load
  };
}
