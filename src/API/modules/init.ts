import http from '@/API';
import { getQueryParamFromURL } from '@/utils';

const v = 'v4.0.0';

/**
 * @description 获取翻译
 * @param {string} lang 语言名称
 */
export const getTranslation = (lang: string) => {
  return http.get(`/api/v1/settings/i18n/luna/?lang=${lang}&v=${v}`);
};

/**
 * @description 获取公共设置
 */
export const getPublicSetting = () => {
  let requestUrl = '/api/v1/settings/public/open/';
  const connectionToken = getQueryParamFromURL('token');

  // ! 解决 /luna/connect?connectToken= 直接方式权限认证问题
  if (connectionToken) {
    requestUrl += `?token=${connectionToken}`;
  }

  return http.get(requestUrl);
};

/**
 * @description 获取系统设置
 */
export const getSystemSetting = () => {
  return http.get('/api/v1/users/preference/?category=luna');
};
