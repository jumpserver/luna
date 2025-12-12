import type { UserSettingPersistedState } from "~/composables/useSettingStorage";
import type { AppConfigType, CharsetType, LangType, LayoutsType, ResolutionType, SortType, ThemeType } from "~/types";

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

  const setLang = (lang: LangType) => {
    state.language = lang;
    persist({ language: lang });
  };

  const setLangGlobal = (lang: LangType) => {
    const wasHydrated = isHydrated.value;
    const languageSnapshot = state.language;
    const siteLanguagesSnapshot = { ...state.siteLanguages };

    const apply = () => {
      const baseLang = wasHydrated ? languageSnapshot : state.language;
      const unionSites = new Set<string>([
        ...Object.keys(state.siteLanguages || {}),
        ...Object.keys(siteLanguagesSnapshot || {})
      ]);

      const allAlreadyTarget = [...unionSites].every((site) => {
        const current = state.siteLanguages?.[site] ?? siteLanguagesSnapshot?.[site] ?? baseLang;
        return current === lang;
      });

      if (baseLang === lang && allAlreadyTarget) {
        state.language = lang;
        return;
      }

      const updated: Record<string, LangType> = {};
      unionSites.forEach((site) => (updated[site] = lang));

      state.language = lang;
      state.siteLanguages = updated;
      enqueuePersist({ language: lang, siteLanguages: updated });
    };

    state.language = lang;
    ensureHydration()
      .then(apply)
      .catch((err) => console.error("setLangGlobal hydration failed", err));
  };

  const setTheme = (t: ThemeType) => {
    state.theme = t;
    persist({ theme: t });
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

  const hasSiteLanguage = (site: string) => site in state.siteLanguages;

  const setSiteLanguage = (site: string, lang: LangType) => {
    if (state.siteLanguages[site] === lang) return;

    state.siteLanguages = { ...state.siteLanguages, [site]: lang };
    persist({ siteLanguages: state.siteLanguages });
  };

  const removeSiteLanguage = (site: string) => {
    if (!(site in state.siteLanguages)) return;

    const updated = { ...state.siteLanguages };
    delete updated[site];
    state.siteLanguages = updated;
    persist({ siteLanguages: updated });
  };

  const getSiteLanguage = (site: string): LangType => state.siteLanguages[site] || state.language;
  const getDefaultLanguage = () => state.language;

  return {
    ...toRefs(state),

    setLang,
    setSort,
    setTheme,
    isHydrated,
    setLayouts,
    setCollapse,
    setAppConfig,
    setFontFamily,
    setLangGlobal,
    setPrimaryColor,
    setFollowSystem,
    getSiteLanguage,
    setSiteLanguage,
    hasSiteLanguage,
    hydrationPromise,
    getDefaultLanguage,
    removeSiteLanguage,
    setPrimaryColorDark,
    setPrimaryColorLight,
    setCharsetPreference,
    setRdpResolutionPreference,
    setBackspacePreference,
    setKeyboardLayoutPreference,
    setRdpClientOptionPreference,
    setRdpColorQualityPreference,
    setRdpSmartSizePreference
  };
};
