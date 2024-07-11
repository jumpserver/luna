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

import type { ResultData } from './interface';

import { setOptionsCSRFToken, setOrgIDToRequestHeader } from '@/API/helper';

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

class RequestHttp {
  service: AxiosInstance;
  public constructor(config: AxiosRequestConfig) {
    this.service = axios.create(config);

    // 请求拦截器
    this.service.interceptors.request.use(
      (config: CustomAxiosRequestConfig) => {
        const globalStore = useGlobalStore();
        const loadingStore = useLoadingStore();

        loadingStore.startLoading();

        if (config.headers) {
          config.headers.set('X-CSRFToken', globalStore.csrfToken);
        }
        return config;
      },
      (error: AxiosError) => {
        console.log(error);
        const loadingStore = useLoadingStore();
        loadingStore.stopLoading();
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.service.interceptors.response.use(
      (response: AxiosResponse) => {
        const loadingStore = useLoadingStore();
        loadingStore.stopLoading();
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
