import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse
} from 'axios';
import { ResultEnum } from '@/enums/httpEnum.ts';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { createDiscreteApi } from 'naive-ui';

import type { ResultData } from './interface';
import { useI18n } from 'vue-i18n';

export interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  loading?: boolean;
  cancel?: boolean;
}

const config = {
  baseURL: import.meta.env.VITE_API_URL as string,
  // 超时时间
  timeout: ResultEnum.TIMEOUT as number,
  // 跨域时候允许携带凭证
  withCredentials: true
};

const { message } = createDiscreteApi(['message']);

// ! 注意：下面这两个函数中 useGlobalStore 不能提升到全局，否则 Pinia 会在 APP 实例被挂在前调用从而报错
const setOptionsCSRFToken = (config: AxiosRequestConfig): AxiosRequestConfig => {
  const globalStore = useGlobalStore();
  const csrfToken = globalStore.csrfToken;

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
const setOrgIDToRequestHeader = (config?: AxiosRequestConfig): AxiosRequestConfig => {
  const globalStore = useGlobalStore();
  const orgID = globalStore.JMSOrg || globalStore.JMSLunaOra;

  config = config || {};

  if (orgID) {
    if (!config.headers) {
      config.headers = {};
    }
    if (!('X-JMS-ORG' in config.headers)) {
      config.headers['X-JMS-ORG'] = orgID;
    }
  }
  return config;
};

class RequestHttp {
  service: AxiosInstance;
  public constructor(config: AxiosRequestConfig) {
    this.service = axios.create(config);

    this.service.interceptors.request.use(
      (config: CustomAxiosRequestConfig) => {
        const loadingStore = useLoadingStore();
        const globalStore = useGlobalStore();

        loadingStore.startLoading();

        if (config.headers) {
          config.headers.set('X-CSRFToken', globalStore.csrfToken);
        }
        return config;
      },
      (error: AxiosError) => {
        const loadingStore = useLoadingStore();
        loadingStore.stopLoading();
        return Promise.reject(error);
      }
    );

    this.service.interceptors.response.use(
      (response: AxiosResponse) => {
        const loadingStore = useLoadingStore();
        loadingStore.stopLoading();
        return response.data;
      },
      (error: AxiosError) => {
        const { t } = useI18n();
        const loadingStore = useLoadingStore();
        loadingStore.stopLoading();

        // 请求超时 && 网络错误单独判断，没有 response
        if (error.message.indexOf('timeout') !== -1) message.error('请求超时！请您稍后重试');
        if (error.message.indexOf('Network Error') !== -1) message.error('网络错误！请您稍后重试');

        message.error(t('ServerError'));

        return Promise.reject(error);
      }
    );
  }

  get<T>(url: string, options?: any): Promise<ResultData<T>> {
    options = setOrgIDToRequestHeader(options);
    return this.service.get(url, options);
  }
  post<T>(url: string, params?: object | string, options?: any): Promise<ResultData<T>> {
    options = setOptionsCSRFToken(options);
    return this.service.post(url, params, options);
  }
  put<T>(url: string, params?: object, _object = {}): Promise<ResultData<T>> {
    return this.service.put(url, params, _object);
  }
  delete<T>(url: string, params?: any, _object = {}): Promise<ResultData<T>> {
    return this.service.delete(url, { params, ..._object });
  }
}

export default new RequestHttp(config);
