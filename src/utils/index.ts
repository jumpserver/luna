export const getBrowserLang = (): string => {
  const browserLang = navigator.language ? navigator.language : navigator.browserLanguage;
  let defaultLang = '';

  if (['zh', 'en', 'zh-cn'].includes(browserLang.toLowerCase())) {
    defaultLang = 'zh';
  } else {
    defaultLang = 'en';
  }

  return defaultLang;
};
