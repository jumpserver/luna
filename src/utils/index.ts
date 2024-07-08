export const getBrowserLang = (): string => {
  const browserLang = navigator.language;
  let defaultLang = '';

  if (['zh', 'en', 'zh-cn'].includes(browserLang.toLowerCase())) {
    defaultLang = 'zh';
  } else {
    defaultLang = 'en';
  }

  return defaultLang;
};

/**
 * @description 获取 Cookie
 * @param name Cookie 名称
 */
export function getCookie(name: string): string {
  let cookieValue = '';

  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');

    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();

      if (cookie.substring(0, name.length + 1) === name + '=') {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

/**
 * @description 防止 CSRF 的 Token
 */
export const getCsrfTokenFromCookie = () => {
  let prefix = getCookie('SESSION_COOKIE_NAME_PREFIX');
  if (!prefix || [`""`, `''`].indexOf(prefix) > -1) {
    prefix = '';
  }
  const name = `${prefix}csrftoken`;
  return getCookie(name);
};

/**
 * @description 获取当前系统语言
 */
export const getCurrentLanguage = (): string => {
  // 现在就只是单独设置了这个项目的 Language，并没有与 Lina 同步
  let langCode = JSON.parse(window.localStorage['luna-user']).language;

  if (!langCode) {
    langCode = navigator.language;
  }

  if (langCode.indexOf('en') > -1) {
    return 'en';
  } else if (langCode.indexOf('ja') > -1) {
    return 'ja';
  } else if (langCode.indexOf('zh-hant') > -1) {
    return 'zh-hant';
  } else {
    return 'zh';
  }
};
