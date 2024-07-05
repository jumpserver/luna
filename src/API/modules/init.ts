import http from '@/API';

const v = 'v4.0.0';

// 获取翻译
export const getTranslation = (lang: string) => {
  return http.get(`/v1/settings/i18n/luna/?lang=${lang}&v=${v}`);
};
