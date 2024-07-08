import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getTranslation } from '@/API/modules/init';

export function useTranslations() {
  const { locale, mergeLocaleMessage } = useI18n();
  const currentLang = ref(locale.value);

  const updateTranslations = async (lang: string) => {
    try {
      const res = await getTranslation(lang);

      // 合并翻译数据到 i18n
      mergeLocaleMessage(lang, res);

      console.log(`Updated i18n messages for ${lang}:`, res);
      locale.value = lang;
      currentLang.value = lang;
    } catch (e) {
      console.error(`Error fetching translation for ${lang}:`, e);
    }
  };

  return {
    currentLang,
    updateTranslations
  };
}
