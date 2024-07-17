import { createDiscreteApi } from 'naive-ui';

const { message } = createDiscreteApi(['message']);
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
// todo))
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

/**
 * @description 获取查询参数
 * @param {string} queryKey
 */
export function getQueryParamFromURL(queryKey: string): string | null {
  const queryString = location.search.substring(1);
  const queryParams = new URLSearchParams(queryString);

  for (const [key, value] of queryParams.entries()) {
    if (key === queryKey) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * @description 设置 title
 * @param {string} title tab 页标题
 */
export const setTitle = (title: string) => {
  document.title = title;
};

/**
 * @description 设置 ico
 * @param {string} faviconUrl ico 图标地址
 */
export const setFavicon = (faviconUrl: string) => {
  if (!faviconUrl) {
    console.error('No favicon URL provided');
    return;
  }

  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");

  if (!link) {
    link = document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    document.getElementsByTagName('head')[0].appendChild(link);
  }

  link.href = faviconUrl;
};

/**
 * @description hex颜色转rgb颜色
 * @param str 颜色值字符串
 * @returns {String} 返回处理后的颜色值
 */
export function hexToRgb(str: any) {
  let hexs: any = '';
  let reg = /^\#?[0-9A-Fa-f]{6,8}$/;
  if (!reg.test(str)) return message.warning('输入错误的hex');
  str = str.replace('#', '');
  hexs = str.match(/../g);
  for (let i = 0; i < 3; i++) hexs[i] = parseInt(hexs[i], 16);
  return hexs;
}

/**
 * @description rgb颜色转Hex颜色
 * @param {*} r 代表红色
 * @param {*} g 代表绿色
 * @param {*} b 代表蓝色
 * @returns {String} 返回处理后的颜色值
 */
export function rgbToHex(r: any, g: any, b: any) {
  let reg = /^\d{1,3}$/;
  if (!reg.test(r) || !reg.test(g) || !reg.test(b)) return message.warning('输入错误的rgb颜色值');
  let hexs = [r.toString(16), g.toString(16), b.toString(16)];
  for (let i = 0; i < 3; i++) if (hexs[i].length == 1) hexs[i] = `0${hexs[i]}`;
  return `#${hexs.join('')}`;
}

/**
 * @description 设置亮色主题下的梯度颜色
 */
export function getLightColor(color: string, level: number) {
  let reg = /^#?[0-9A-Fa-f]{6,8}$/;
  if (!reg.test(color)) return message.warning('输入错误的hex颜色值');
  let rgb = hexToRgb(color);
  for (let i = 0; i < 3; i++) rgb[i] = Math.round(255 * level + rgb[i] * (1 - level));
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

/**
 * @description 加深颜色值
 * @param {String} color 颜色值字符串
 * @param {Number} level 加深的程度，限0-1之间
 * @returns {String} 返回处理后的颜色值
 */
export function getDarkColor(color: string, level: number) {
  let reg = /^#?[0-9A-Fa-f]{6,8}$/;
  if (!reg.test(color)) return message.warning('输入错误的 hex 颜色值');
  let rgb = hexToRgb(color);
  for (let i = 0; i < 3; i++) rgb[i] = Math.round(20.5 * level + rgb[i] * (1 - level));
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

/**
 * @description 判断文件是否是文件夹节点
 * @param {string} id
 */
export function isFileFolder(id: String) {
  return id.includes(':');
}
