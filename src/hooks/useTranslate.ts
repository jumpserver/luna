import { setTitle } from '@/utils';
import { useI18n } from 'vue-i18n';
import { nextTick, ref } from 'vue';
import { getTranslation } from '@/API/modules/init';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { useLoadingStore } from '@/stores/modules/loading.ts';

export function useTranslations() {
  const { t, locale, mergeLocaleMessage } = useI18n();

  const globalStore = useGlobalStore();
  const loadingStore = useLoadingStore();

  const currentLang = ref(locale.value);

  const updateTranslations = async (lang: string): Promise<void> => {
    try {
      // 开始加载
      loadingStore.startLoading();

      const res = await getTranslation(lang);

      // 合并翻译数据到 i18n
      mergeLocaleMessage(lang, res);

      await nextTick();

      console.log(`Updated i18n messages for ${lang}:`, res);

      locale.value = lang;
      currentLang.value = lang;

      // 修改 html 元素中的 lang 属性
      document.documentElement.lang = lang;

      // 设置 tab 标签的标题
      setTitle(`${t('Web Terminal')} - ${globalStore.interface.login_title}`);

      // 结束 loading
      loadingStore.stopLoading();
    } catch (e) {
      console.error(`Error fetching translation for ${lang}:`, e);
    }
  };

  return {
    currentLang,
    updateTranslations
  };
}
