import type { AppConfigType, SortType } from '~/types';

type themeType = 'light' | 'dark' | '';
export type layoutsType = 'grid' | 'table';

export const useUserSettingStore = defineStore(
  'userSetting',
  () => {
    const { emit } = useEventBus();

    const language = ref('zh');
    const collapse = ref(false);

    const appConfig = ref<AppConfigType>();
    const sort = ref<SortType>('name');
    const theme = ref<themeType>('');
    const layouts = ref<layoutsType>('grid');

    const setLang = (lang: string) => {
      language.value = lang;
    };

    const setTheme = (t: themeType) => {
      theme.value = t;
    };

    const setLayouts = (l: layoutsType) => {
      layouts.value = l;
    };

    const setCollapse = (c: boolean) => {
      collapse.value = c;
    };

    const setSort = (s: SortType) => {
      sort.value = s;
      emit('setSort', s);
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

      setSort,
      setLang,
      setTheme,
      setLayouts,
      setCollapse,
      setAppConfig,
    };
  },
  {
    persist: {
      storage: localStorage,
      pick: ['sort', 'theme', 'layouts', 'language', 'collapse', 'appConfig'],
    },
  }
);
