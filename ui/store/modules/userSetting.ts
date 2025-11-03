import type { AppConfigType, SortType } from "~/types";

export type themeType = "light" | "dark" | "withSystem" | "";
export type layoutsType = "grid" | "table";

export const useUserSettingStore = defineStore(
  "userSetting",
  () => {
    const { emit } = useEventBus();

    const language = ref("zh");
    const collapse = ref(false);

    const appConfig = ref<AppConfigType>();
    const sort = ref<SortType>("name");
    const theme = ref<themeType>("");
    const followSystem = ref<boolean>(false);
    const layouts = ref<layoutsType>("grid");
    
    const fontFamily = ref<string>('"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial');
    const primaryColor = ref<string>("#1ab394");
    const primaryColorLight = ref<string>("#1ab394");
    const primaryColorDark = ref<string>("#34d399");

    const setLang = (lang: string) => {
      language.value = lang;
    };

    const setTheme = (t: themeType) => {
      theme.value = t;
    };

    const setFollowSystem = (v: boolean) => {
      followSystem.value = !!v;
    };

    const setFontFamily = (f: string) => {
      fontFamily.value = f;
    };

    const setPrimaryColor = (c: string) => {
      primaryColor.value = c;
    };

    const setPrimaryColorLight = (c: string) => {
      primaryColorLight.value = c;
    };

    const setPrimaryColorDark = (c: string) => {
      primaryColorDark.value = c;
    };

    const setLayouts = (l: layoutsType) => {
      layouts.value = l;
    };

    const setCollapse = (c: boolean) => {
      collapse.value = c;
    };

    const setSort = (s: SortType) => {
      sort.value = s;
      emit("setSort", s);
    };

    const setAppConfig = (c: AppConfigType) => {
      appConfig.value = c;
    };

    return {
      sort,
      theme,
      layouts,
      language,
      collapse,
      appConfig,
      followSystem,
      fontFamily,
      primaryColor,
      primaryColorLight,
      primaryColorDark,

      setSort,
      setLang,
      setTheme,
      setLayouts,
      setCollapse,
      setAppConfig,
      setFontFamily,
      setFollowSystem,
      setPrimaryColor,
      setPrimaryColorLight,
      setPrimaryColorDark
    };
  },
  {
    persist: {
      storage: localStorage,
      pick: [
        "sort",
        "theme",
        "layouts",
        "language",
        "collapse",
        "appConfig",
        "fontFamily",
        "primaryColor",
        "primaryColorLight",
        "primaryColorDark",
        "followSystem"
      ]
    }
  }
);
