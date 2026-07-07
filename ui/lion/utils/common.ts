import {
  BASE_URL,
  BASE_WS_URL,
  ORIGIN,
  withBasePath,
  withBaseUrl,
  withLionWsUrl,
} from './base';

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\\/]+/g, '_');
}

export const FileType = {
  NORMAL: 'NORMAL',
  DIRECTORY: 'DIRECTORY',
};

export function isDirectory(guacFile: { type: string }): boolean {
  return guacFile.type === FileType.DIRECTORY;
}

export { BASE_WS_URL, BASE_URL };

export const OriginSite = ORIGIN;

export const BaseAPIURL = withBaseUrl('/lion/api');

const sessionBaseAPI = withBasePath('/api');
const wsURL = withLionWsUrl('/ws/connect/');
const monitorWsURL = withLionWsUrl('/ws/monitor/');

export function getCurrentConnectParams() {
  const urlParams = getURLParams();
  const data: any = {};
  urlParams.forEach(function (value, key, parent) {
    data[key] = value;
  });
  const result: any = {};
  result['data'] = data;
  result['ws'] = wsURL;
  result['api'] = sessionBaseAPI;
  return result;
}

export function getMonitorConnectParams() {
  const urlParams = getURLParams();
  const data: any = {};
  urlParams.forEach(function (value, key, parent) {
    data[key] = value;
  });
  const result: any = {};
  result['data'] = data;
  result['ws'] = monitorWsURL;
  return result;
}

export function getURLParams() {
  if (window.location.search) {
    return new URLSearchParams(window.location.search.slice(1));
  }

  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    return new URLSearchParams(hash.slice(queryIndex + 1));
  }

  return new URLSearchParams();
}

export function localStorageGet(key: string): string | object | null {
  let data = localStorage.getItem(key);
  if (!data) {
    return data;
  }
  try {
    data = JSON.parse(data);
    return data;
  } catch (e) {
    //
  }
  return data;
}

export function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(name + '=([^;]+)'));
  return match ? match[1] : undefined;
}

export function CopyTextToClipboard(text: string) {
  const transfer = document.createElement('textarea');
  document.body.appendChild(transfer);
  transfer.value = text;
  transfer.focus();
  transfer.select();
  document.execCommand('copy');
  document.body.removeChild(transfer);
}
