import { computed, onScopeDispose, shallowRef, watch } from "vue";
import type { Ref } from "vue";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
import type {
  CodexRuntimeStatus,
  LocalCodexModel,
  LocalCodexSettings,
  LocalCodexSettingsInput
} from "~/shared/codex/types";
import { localAiMessages } from "~/shared/codex/messages";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { setLocalCodexEnabled } from "~/shared/aiAvailability";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

export const localCodexSettings = shallowRef<LocalCodexSettings>({ ...DEFAULT_CODEX_SETTINGS });
export const localCodexRevision = shallowRef(0);
export const localCodexRuntime = shallowRef<CodexRuntimeStatus | null>(null);
export function useLocalAiMessages() {
  return useI18n({ useScope: "local", messages: localAiMessages, fallbackLocale: "en" });
}
let settingsContext = "";
function apply(settings: LocalCodexSettings) {
  if (JSON.stringify(settings) !== JSON.stringify(localCodexSettings.value)) {
    localCodexSettings.value = settings;
    localCodexRevision.value++;
  }
  setLocalCodexEnabled(isDesktopRuntime() && settings.enabled);
}
export function useLocalCodex(authReady: Ref<boolean> = computed(() => true)) {
  const user = useUserInfoStore();
  const context = computed(() =>
    isDesktopRuntime() && authReady.value && user.loggedIn
      ? JSON.stringify([user.currentSite, user.currentAccountId])
      : ""
  );
  let generation = 0;
  let disposed = false;
  let locked = false;
  const stops: Array<() => void> = [];
  async function refresh() {
    const current = generation;
    if (!context.value || disposed) return;
    const settings = await desktopInvoke<LocalCodexSettings>("local_codex_settings");
    if (!disposed && current === generation) apply(settings);
  }
  watch(
    context,
    () => {
      ++generation;
      if (settingsContext !== context.value) {
        settingsContext = context.value;
        apply({ ...DEFAULT_CODEX_SETTINGS });
      }
      void refresh().catch(() => {});
    },
    { immediate: true, flush: "sync" }
  );
  if (isDesktopRuntime()) {
    for (const [name, handler] of [
      ["local-codex-runtime", (event: { payload: CodexRuntimeStatus }) => (localCodexRuntime.value = event.payload)],
      ["local-codex-settings", () => void refresh().catch(() => {})],
      [
        "client-lock-state",
        (event: { payload: { locked: boolean } }) => {
          if (locked && !event.payload.locked) {
            localCodexRevision.value++;
            void refresh().catch(() => {});
          }
          locked = event.payload.locked;
        }
      ]
    ] as const) {
      void desktopListen(name, handler as (event: any) => void)
        .then((stop) => {
          if (disposed) stop();
          else stops.push(stop);
        })
        .catch(() => {});
    }
  }
  onScopeDispose(() => {
    disposed = true;
    ++generation;
    for (const stop of stops) stop();
  });
  return {
    settings: localCodexSettings,
    runtime: localCodexRuntime,
    refresh,
    async save(settings: LocalCodexSettingsInput) {
      const current = generation;
      const saved = await desktopInvoke<LocalCodexSettings>("local_codex_configure", { settings });
      if (!disposed && current === generation) {
        apply(saved);
      }
    },
    async refreshRuntime() {
      if (!context.value || disposed) return;
      localCodexRuntime.value = await desktopInvoke<CodexRuntimeStatus>("local_codex_runtime_status");
    },
    async install() {
      localCodexRuntime.value = await desktopInvoke<CodexRuntimeStatus>("local_codex_install");
    },
    probe: (settings: LocalCodexSettings) => desktopInvoke<{ version: string }>("local_codex_probe", { settings }),
    models: (settings: LocalCodexSettingsInput) => desktopInvoke<LocalCodexModel[]>("local_codex_models", { settings }),
    test: (settings: LocalCodexSettingsInput) => desktopInvoke("local_codex_test", { settings })
  };
}
