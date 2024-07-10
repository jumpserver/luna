import { AxiosRequestConfig } from 'axios';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { storeToRefs } from 'pinia';

/**
 * @description 主要在 post、put、delete、patch 请求中设置 csrfToken
 * @param {AxiosRequestConfig} config
 */
export const setOptionsCSRFToken = (config?: AxiosRequestConfig): AxiosRequestConfig => {
  const globalStore = useGlobalStore();

  const { csrfToken } = storeToRefs(globalStore);

  if (!config) {
    config = {};
  }

  if (csrfToken) {
    if (!config.headers) {
      config.headers = {};
    }
    config.headers['X-CSRFToken'] = csrfToken;
  }

  return config;
};

/**
 * @description 主要在 get 请求中设置  Organization Id
 * @param {AxiosRequestConfig} config
 */
export const setOrgIDToRequestHeader = (config: AxiosRequestConfig) => {
  const globalStore = useGlobalStore();

  const { JMSOrg, JMSLunaOra } = storeToRefs(globalStore);

  if (!config) {
    config = {};
  }

  if (JMSOrg || JMSLunaOra) {
    if (!config.headers) {
      config.headers = {};
    }

    if (!('X-JMS-ORG' in config.headers)) {
      config.headers['X-JMS-ORG'] = JMSOrg || JMSLunaOra;
    }
  }

  return config;
};
