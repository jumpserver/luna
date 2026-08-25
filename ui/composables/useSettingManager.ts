import type { UserSettingPersistedState } from "~/composables/useSettingStorage";
import type {
  AppConfigType,
  CharsetType,
  LanguagePreference,
  LayoutsType,
  ResolutionType,
  SidebarSectionVisibility,
  SortType,
  ThemeType
} from "~/types";

import { createBatchedPersist } from "~/composables/createBatchedPersist";
import { normalizeFontSize, normalizeSidebarWidth, useSettingStorage } from "~/composables/useSettingStorage";
import { DEFAULT_SIDEBAR_SECTIONS, normalizeSidebarSections } from "~/composables/useSidebarSections";
import { DEFAULT_DARK_THEME_PRESET, DEFAULT_LIGHT_THEME_PRESET, isThemePresetId } from "~/composables/useThemePresets";
import { isCodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import { TERMINAL_THEME_PRESETS } from "~/shared/theme/presets/terminal";

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

      const normalizedUiFontSize = normalizeFontSize(state.uiFontSize);
      const normalizedCodeFontSize = normalizeFontSize(state.codeFontSize);

      if (normalizedUiFontSize !== state.uiFontSize) {
        state.uiFontSize = normalizedUiFontSize;
        patch.uiFontSize = normalizedUiFontSize;
      }

      if (normalizedCodeFontSize !== state.codeFontSize) {
        state.codeFontSize = normalizedCodeFontSize;
        patch.codeFontSize = normalizedCodeFontSize;
      }

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

      const desiredFollowSystem =
        normalizedMode === "withSystem"
          ? true
          : normalizedMode === "dark" || normalizedMode === "light"
            ? false
            : state.followSystem;

      if (desiredFollowSystem !== state.followSystem) {
        state.followSystem = desiredFollowSystem;
        patch.followSystem = desiredFollowSystem;
      }

      const normalizedLightThemePreset = isThemePresetId(state.lightThemePreset)
        ? state.lightThemePreset
        : DEFAULT_LIGHT_THEME_PRESET;
      const normalizedDarkThemePreset = isThemePresetId(state.darkThemePreset)
        ? state.darkThemePreset
        : DEFAULT_DARK_THEME_PRESET;

      if (normalizedLightThemePreset !== state.lightThemePreset) {
        state.lightThemePreset = normalizedLightThemePreset;
        patch.lightThemePreset = normalizedLightThemePreset;
      }

      if (normalizedDarkThemePreset !== state.darkThemePreset) {
        state.darkThemePreset = normalizedDarkThemePreset;
        patch.darkThemePreset = normalizedDarkThemePreset;
      }

      const normalizedTerminalThemePreset = TERMINAL_THEME_PRESETS.some(
        (preset) => preset.id === state.terminalThemePreset
      )
        ? state.terminalThemePreset
        : "follow-app";
      const normalizedCodeMirrorThemePreset = isCodeMirrorThemePresetId(state.codeMirrorThemePreset)
        ? state.codeMirrorThemePreset
        : "follow-app";

      if (normalizedTerminalThemePreset !== state.terminalThemePreset) {
        state.terminalThemePreset = normalizedTerminalThemePreset;
        patch.terminalThemePreset = normalizedTerminalThemePreset;
      }

      if (normalizedCodeMirrorThemePreset !== state.codeMirrorThemePreset) {
        state.codeMirrorThemePreset = normalizedCodeMirrorThemePreset;
        patch.codeMirrorThemePreset = normalizedCodeMirrorThemePreset;
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

  const setUiFontSize = (size: number) => {
    state.uiFontSize = normalizeFontSize(size);
    persist({ uiFontSize: state.uiFontSize });
  };

  const setCodeFontSize = (size: number) => {
    state.codeFontSize = normalizeFontSize(size);
    persist({ codeFontSize: state.codeFontSize });
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

  const setLightThemePreset = (preset: UserSettingPersistedState["lightThemePreset"]) => {
    state.lightThemePreset = preset;
    persist({ lightThemePreset: preset });
  };

  const setDarkThemePreset = (preset: UserSettingPersistedState["darkThemePreset"]) => {
    state.darkThemePreset = preset;
    persist({ darkThemePreset: preset });
  };

  const setTerminalThemePreset = (preset: string) => {
    state.terminalThemePreset = preset || "follow-app";
    persist({ terminalThemePreset: state.terminalThemePreset });
  };

  const setCodeMirrorThemePreset = (preset: UserSettingPersistedState["codeMirrorThemePreset"]) => {
    state.codeMirrorThemePreset = preset;
    persist({ codeMirrorThemePreset: preset });
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

  const setSidebarWidth = (width: number) => {
    state.sidebarWidth = normalizeSidebarWidth(width);
  };

  const persistSidebarWidth = () => {
    persist({ sidebarWidth: state.sidebarWidth });
  };

  const setSidebarSections = (sections: Partial<SidebarSectionVisibility>) => {
    state.sidebarSections = normalizeSidebarSections({
      ...state.sidebarSections,
      ...sections
    });
    persist({ sidebarSections: state.sidebarSections });
  };

  const resetSidebarSections = () => {
    state.sidebarSections = { ...DEFAULT_SIDEBAR_SECTIONS };
    persist({ sidebarSections: state.sidebarSections });
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
    setUiFontSize,
    setCodeFontSize,
    setPrimaryColor,
    setFollowSystem,
    hydrationPromise,
    setPrimaryColorDark,
    setPrimaryColorLight,
    setLightThemePreset,
    setDarkThemePreset,
    setTerminalThemePreset,
    setCodeMirrorThemePreset,
    setCharsetPreference,
    setRdpResolutionPreference,
    setBackspacePreference,
    setKeyboardLayoutPreference,
    setRdpClientOptionPreference,
    setRdpColorQualityPreference,
    setRdpSmartSizePreference,
    setRecentSites,
    setSidebarWidth,
    persistSidebarWidth,
    setSidebarSections,
    resetSidebarSections
  };
};
