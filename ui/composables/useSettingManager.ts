import type {
  SortType,
  ThemeType,
  LayoutsType,
  AppConfigType,
  LangType,
  CharsetType,
  ResolutionType
} from "~/types";
import { useSettingStorage, type UserSettingPersistedState } from "~/composables/useSettingStorage";

export const useSettingManager = () => {
  const storage = useSettingStorage();

  const isHydrated = ref(false);
  const hydrationPromise = ref<Promise<void> | null>(null);

  const state = reactive<UserSettingPersistedState>({
    ...storage.defaults
  });

  let isSaving = false;
  let unsubscribe: (() => void) | null = null;

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
    const promise = ensureHydration();

    void promise
      .then(async () => {
        isSaving = true;
        try {
          await storage.patch(partial);
        } catch (err) {
          console.error("patch user setting failed", err);
        } finally {
          isSaving = false;
        }
      })
      .catch((err) => {
        console.error("persist user setting failed", err);
      });
  };

  const setLang = (lang: LangType) => {
    state.language = lang;
    persist({ language: lang });
  };

  const setLangGlobal = (lang: LangType) => {
    state.language = lang;

    // 覆盖所有站点：以存储中的 siteLanguages 为准，避免仅依据当前窗口内存键集合
    ensureHydration()
      .then(async () => {
        try {
          const saved = await storage.load();
          const savedSites = Object.keys(saved.siteLanguages || {});

          const unionSites = new Set<string>([...savedSites, ...Object.keys(state.siteLanguages || {})]);

          // 如果持久化与内存的联合集合中全部已是目标语言，则直接跳过，避免重复应用与重复日志
          const allAlreadyTarget = [...unionSites].every((site) => {
            const current =
              (state.siteLanguages && state.siteLanguages[site]) ??
              (saved.siteLanguages && saved.siteLanguages[site]) ??
              saved.language ??
              state.language;
            return current === lang;
          });

          if ((saved.language ?? state.language) === lang && allAlreadyTarget) {
            return;
          }

          const updated: Record<string, LangType> = {};
          unionSites.forEach((site) => (updated[site] = lang));

          state.siteLanguages = updated;
          persist({ language: lang, siteLanguages: updated });
        } catch (err) {
          console.error("setLangGlobal load failed, fallback to memory keys", err);
          const fallback: Record<string, LangType> = { ...state.siteLanguages };
          Object.keys(fallback).forEach((site) => (fallback[site] = lang));
          state.siteLanguages = fallback;
          persist({ language: lang, siteLanguages: fallback });
        }
      })
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
    state.appConfig = config ?? null;
    persist({ appConfig: state.appConfig });
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

  ensureHydration();

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
