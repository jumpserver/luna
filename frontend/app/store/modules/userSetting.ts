type themeType = 'light' | 'dark';
type layoutsType = 'grid' | 'table';
type sortType = 'az' | 'za' | 'newest-to-oldest' | 'oldest-to-newest';

export const useUserSettingStore = defineStore(
  'userSetting',
  () => {
    const language = ref('zh');
    const collapse = ref(false);
    
    const sort = ref<sortType>('az');
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

    const setSort = (s: sortType) => {
      sort.value = s;
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
    },
  }
);
