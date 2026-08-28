import type { PublicSettings } from "~/composables/useApiRequest";
import type { UserProfile } from "~/types";
import { formatLocalDateTime } from "#online-player/utils/time";
import { getPublicSettings, getUserProfile } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import {
  buildWatermarkViewer,
  interpolateWatermark,
  isWatermarkSettingEnabled,
  resolveWatermarkTemplate,
  shouldShowAppWatermark,
  softenWatermarkColor
} from "~/utils/watermark";

const TIME_TICK_MS = 60_000;

// ponytail: one window-level overlay only; per-pane asset watermarks and theme-aware color fallbacks are the upgrade path.
export function useAppWatermark() {
  const route = useRoute();
  const userInfoStore = useUserInfoStore();
  const { loggedIn, currentUser } = storeToRefs(userInfoStore);
  const { authReady } = useAuthSession();
  const { activeTab } = useWorkspaceTabs();

  const settings = ref<PublicSettings | null>(null);
  const profile = ref<Pick<UserProfile, "id" | "name" | "username"> | null>(null);
  const nowIso = ref(new Date().toISOString());
  let loadGeneration = 0;
  let timeTimer: ReturnType<typeof setInterval> | null = null;

  const template = computed(() => resolveWatermarkTemplate(settings.value || {}));
  const needsClock = computed(() => template.value.includes("currentTime"));
  const enabled = computed(() =>
    shouldShowAppWatermark({
      loggedIn: loggedIn.value,
      enabled: isWatermarkSettingEnabled(settings.value?.SECURITY_WATERMARK_ENABLED),
      path: route.path
    })
  );

  const content = computed(() => {
    if (!enabled.value) return "";

    const user = profile.value;
    const fallback = currentUser.value;
    const sessionText = interpolateWatermark(template.value, {
      userId: user?.id || fallback?.userId || "",
      name: user?.name || fallback?.name || "",
      userName: user?.username || "",
      assetId: activeTab.value?.assetId || "",
      assetName: activeTab.value?.assetName || "",
      assetAddress: activeTab.value?.address || "",
      currentTime: formatLocalDateTime(nowIso.value)
    });

    return sessionText || buildWatermarkViewer(user?.name || fallback?.name, user?.username);
  });

  const options = computed(() => ({
    content: content.value,
    contentType: "multi-line-text",
    width: Math.max(Number(settings.value?.SECURITY_WATERMARK_WIDTH) || 300, 360),
    height: Math.max(Number(settings.value?.SECURITY_WATERMARK_HEIGHT) || 200, 240),
    rotate: Number(settings.value?.SECURITY_WATERMARK_ROTATE) || 22,
    fontSize: `${Number(settings.value?.SECURITY_WATERMARK_FONT_SIZE) || 15}px`,
    fontColor: softenWatermarkColor(String(settings.value?.SECURITY_WATERMARK_COLOR || "rgba(255,255,255,0.08)")),
    fontFamily: "JetBrains Mono, SF Mono, Menlo, monospace",
    globalAlpha: 1,
    // ponytail: body-wide mutation protection can freeze reactive pages; use a scoped, debounced observer if
    // tamper recovery is required.
    mutationObserve: false,
    zIndex: 1000
  }));

  const clearClock = () => {
    if (!timeTimer) return;
    clearInterval(timeTimer);
    timeTimer = null;
  };

  const syncClock = () => {
    clearClock();
    if (!enabled.value || !needsClock.value) return;
    nowIso.value = new Date().toISOString();
    timeTimer = setInterval(() => {
      nowIso.value = new Date().toISOString();
    }, TIME_TICK_MS);
  };

  const load = async () => {
    const token = ++loadGeneration;
    if (!loggedIn.value) {
      settings.value = null;
      profile.value = null;
      return;
    }

    try {
      const [nextSettings, nextProfile] = await Promise.all([getPublicSettings(), getUserProfile().catch(() => null)]);
      if (token !== loadGeneration) return;
      settings.value = nextSettings;
      profile.value = nextProfile;
    } catch {
      if (token !== loadGeneration) return;
      settings.value = null;
      profile.value = null;
    }
  };

  watch(
    [loggedIn, authReady],
    () => {
      if (!loggedIn.value) {
        loadGeneration += 1;
        settings.value = null;
        profile.value = null;
        return;
      }
      if (!authReady.value) return;
      void load();
    },
    { immediate: true }
  );
  watch([enabled, needsClock], syncClock, { immediate: true });
  useEventListener(window, "focus", () => void load());
  onBeforeUnmount(() => {
    loadGeneration += 1;
    clearClock();
  });

  return {
    enabled,
    options
  };
}
