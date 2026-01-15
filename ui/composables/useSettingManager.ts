import type { UserSettingPersistedState } from "~/composables/useSettingStorage";
import type { AppConfigType, CharsetType, LanguagePreference, LayoutsType, ResolutionType, SortType, ThemeType } from "~/types";

import { createBatchedPersist } from "~/composables/createBatchedPersist";
import { useSettingStorage } from "~/composables/useSettingStorage";

const storage = useSettingStorage();

const isHydrated = ref(false);
const hydrationPromise = ref<Promise<void> | null>(null);

const state = reactive<UserSettingPersistedState>({
  ...storage.defaults
});

let isSaving = false;
let unsubscribe: (() => void) | null = null;
let initialized = false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribe?.();
    unsubscribe = null;
  });
}

const { enqueue: enqueuePersist } = createBatchedPersist<UserSettingPersistedState>(
  async (partial) => {
    await storage.patch(partial);
  },
  {
    onStart: () => {
      isSaving = true;
    },
    onEnd: () => {
      isSaving = false;
    },
    onError: (err) => {
      console.error("patch user setting failed", err);
    }
  }
);

const ensureHydration = () => {
  if (hydrationPromise.value) return hydrationPromise.value;

  hydrationPromise.value = (async () => {
    try {
      const saved = await storage.load();
      Object.assign(state, saved);

      const patch: Partial<UserSettingPersistedState> = {};

      const normalizedMode = (() => {
        const raw = (state.themeMode || "") as ThemeType;
        if (raw === "withSystem" || raw === "dark" || raw === "light") return raw;

        const legacyTheme = (state.theme || "") as ThemeType;
        if (legacyTheme === "withSystem") return "withSystem";
        if (state.followSystem) return "withSystem";
        if (legacyTheme === "dark" || legacyTheme === "light") return legacyTheme;

        return "" as ThemeType;
      })();

      if (normalizedMode !== (state.themeMode || "")) {
        state.themeMode = normalizedMode;
        patch.themeMode = normalizedMode;
      }

      const desiredFollowSystem
        = normalizedMode === "withSystem"
          ? true
          : normalizedMode === "dark" || normalizedMode === "light"
            ? false
            : state.followSystem;

      if (desiredFollowSystem !== state.followSystem) {
        state.followSystem = desiredFollowSystem;
        patch.followSystem = desiredFollowSystem;
      }

      if (Object.keys(patch).length > 0) {
        try {
          await storage.patch(patch);
        } catch (err) {
          console.error("migrate user setting failed", err);
        }
      }
    } catch (err) {
      console.error("load user setting failed", err);
    } finally {
      isHydrated.value = true;
    }

    try {
      unsubscribe = await storage.subscribe((next) => {
        if (isSaving) return;
        Object.assign(state, next);
      });
    } catch (err) {
      console.error("subscribe user setting failed", err);
    }
  })();

  return hydrationPromise.value;
};

const persist = (partial: Partial<UserSettingPersistedState>) => {
  void ensureHydration()
    .then(() => {
      enqueuePersist(partial);
    })
    .catch((err) => {
      console.error("persist user setting failed", err);
    });
};

export const useSettingManager = () => {
  if (!initialized) {
    initialized = true;
    ensureHydration();
  }

  const setLang = (lang: LanguagePreference) => {
    state.language = lang;
    persist({ language: lang });
  };

  const setTheme = (t: ThemeType) => {
    state.theme = t;
    persist({ theme: t });
  };

  const setThemeMode = (m: ThemeType) => {
    state.themeMode = m;
    persist({ themeMode: m });
  };

  const setFollowSystem = (v: boolean) => {
    state.followSystem = !!v;
    persist({ followSystem: state.followSystem });
  };

  const setFontFamily = (f: string) => {
    state.fontFamily = f;
    persist({ fontFamily: f });
  };

  const setPrimaryColor = (c: string) => {
    state.primaryColor = c;
    persist({ primaryColor: c });
  };

  const setPrimaryColorLight = (c: string) => {
    state.primaryColorLight = c;
    persist({ primaryColorLight: c });
  };

  const setPrimaryColorDark = (c: string) => {
    state.primaryColorDark = c;
    persist({ primaryColorDark: c });
  };

  const setLayouts = (l: LayoutsType) => {
    state.layouts = l;
    persist({ layouts: l });
  };

  const setCollapse = (c: boolean) => {
    state.collapse = !!c;
    persist({ collapse: state.collapse });
  };

  const setSort = (s: SortType) => {
    state.sort = s;
    useEventBus().emit("setSort", s);
    persist({ sort: s });
  };

  const setAppConfig = (config: AppConfigType | undefined) => {
    // 确保从 store 加载完成，避免默认值覆盖刚写入的配置
    ensureHydration()
      .then(() => {
        state.appConfig = config ?? null;
        enqueuePersist({ appConfig: state.appConfig });
      })
      .catch((err) => {
        console.error("setAppConfig hydration failed", err);
      });
  };

  const setCharsetPreference = (charset: CharsetType) => {
    state.charset = charset;
    persist({ charset });
  };

  const setRdpResolutionPreference = (resolution: ResolutionType) => {
    state.rdpResolution = resolution;
    persist({ rdpResolution: resolution });
  };

  const setBackspacePreference = (enabled: boolean) => {
    state.backspaceAsCtrlH = !!enabled;
    persist({ backspaceAsCtrlH: state.backspaceAsCtrlH });
  };

  const setKeyboardLayoutPreference = (layout: string) => {
    state.keyboardLayout = layout || "en-us-qwerty";
    persist({ keyboardLayout: state.keyboardLayout });
  };

  const setRdpClientOptionPreference = (options: string[]) => {
    state.rdpClientOption = Array.isArray(options) ? [...options] : [];
    persist({ rdpClientOption: state.rdpClientOption });
  };

  const setRdpColorQualityPreference = (quality: string) => {
    state.rdpColorQuality = quality || "32";
    persist({ rdpColorQuality: state.rdpColorQuality });
  };

  const setRdpSmartSizePreference = (value: string) => {
    state.rdpSmartSize = value || "0";
    persist({ rdpSmartSize: state.rdpSmartSize });
  };

  const setRecentSites = (sites: string[]) => {
    state.recentSites = Array.isArray(sites) ? [...sites] : [];
    persist({ recentSites: state.recentSites });
  };

  return {
    ...toRefs(state),

    setLang,
    setSort,
    setTheme,
    setThemeMode,
    isHydrated,
    setLayouts,
    setCollapse,
    setAppConfig,
    setFontFamily,
    setPrimaryColor,
    setFollowSystem,
    hydrationPromise,
    setPrimaryColorDark,
    setPrimaryColorLight,
    setCharsetPreference,
    setRdpResolutionPreference,
    setBackspacePreference,
    setKeyboardLayoutPreference,
    setRdpClientOptionPreference,
    setRdpColorQualityPreference,
    setRdpSmartSizePreference,
    setRecentSites
  };
};
