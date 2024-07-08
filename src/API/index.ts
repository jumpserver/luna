import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse
} from 'axios';
import type { ResultData } from './interface';
import { ResultEnum } from '@/enums/httpEnum.ts';
import { useUserStore } from '@/stores/modules/user.ts';

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

// ! 注意：下面这两个函数中 useUserStore 不能提升到全局，否则 Pinia 会在 APP 实例被挂在前调用从而报错
const setOptionsCSRFToken = (config: AxiosRequestConfig): AxiosRequestConfig => {
  const userStore = useUserStore();
  const csrfToken = userStore.csrfToken;

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
  const userStore = useUserStore();
  const orgID = userStore.JMSOrg || userStore.JMSLunaOra;

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
        const userStore = useUserStore();

        if (config.headers) {
          config.headers.set('X-CSRFToken', userStore.token);
        }
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    this.service.interceptors.response.use(
      (response: AxiosResponse) => {
        return response.data;
      },
      (error: AxiosError) => {
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
