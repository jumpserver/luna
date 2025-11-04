import { reactive, toRefs, ref, onMounted, onBeforeUnmount } from "vue";
import type { SortType, ThemeType, LayoutsType, AppConfigType } from "~/types";
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

  const setLang = (lang: string) => {
    state.language = lang;
    persist({ language: lang });
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

  if (typeof window !== "undefined") {
    ensureHydration();
  }

  onMounted(() => {
    ensureHydration();
  });

  onBeforeUnmount(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

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
    setPrimaryColor,
    setFollowSystem,
    hydrationPromise,
    setPrimaryColorDark,
    setPrimaryColorLight
  };
};
