import type { SortType } from '~/types';

type themeType = 'light' | 'dark';
type layoutsType = 'grid' | 'table';

export const useUserSettingStore = defineStore(
  'userSetting',
  () => {
    const { emit } = useEventBus();

    const language = ref('zh');
    const collapse = ref(false);

    const sort = ref<SortType>('name');
    const theme = ref<themeType>('light');
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

    return {
      sort,
      theme,
      layouts,
      language,
      collapse,

      setSort,
      setLang,
      setTheme,
      setLayouts,
      setCollapse,
    };
  },
  {
    persist: {
      storage: localStorage,
      pick: ['sort', 'theme', 'layouts', 'language', 'collapse'],
    },
  }
);
