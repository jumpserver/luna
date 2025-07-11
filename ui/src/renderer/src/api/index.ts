import axios from 'axios';
import { computed, ref } from 'vue';
import { useUserStore } from '@renderer/store/module/userStore';
import { createDiscreteApi, lightTheme, darkTheme } from 'naive-ui';
import { useElectronConfig } from '@renderer/hooks/useElectronConfig';

import type { ConfigProviderProps } from 'naive-ui';
import type { CustomAxiosRequestConfig, ResultData } from './interface/index';
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const config = {
  timeout: 5000,
  withCredentials: true
};

const defaultTheme = ref('');

let hasShown401Message = false; // 放在模块最顶层，作用域全局共享

try {
  const { getDefaultSetting } = useElectronConfig();
  const { theme } = await getDefaultSetting();

  defaultTheme.value = theme;
} catch (e) {
  console.log(e);
}

const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
  theme: defaultTheme.value === 'light' ? lightTheme : darkTheme
}));

const { message } = createDiscreteApi(['message'], {
  configProviderProps: configProviderPropsRef
});

class RequestHttp {
  public service: AxiosInstance;

  constructor(config: AxiosRequestConfig) {
    this.service = axios.create(config);

    /**
     * @description 请求拦截器
     */
    this.service.interceptors.request.use(
      (config: CustomAxiosRequestConfig) => {
        const userStore = useUserStore();

        if (!userStore.session) {
          return Promise.reject();
        }

        config.loading ??= true;
        config.baseURL = userStore.currentSite ?? 'https://jumpserver.local';

        userStore.setLoading(config.loading);

        if (config.headers) {
          config.headers['X-JMS-ORG'] = userStore.currentOrganization;
          config.headers['X-TZ'] = Intl.DateTimeFormat().resolvedOptions().timeZone;

          if (userStore.csrfToken) {
            config.headers['X-CSRFToken'] = userStore.csrfToken;
          }

          // 调试：检查请求配置
          console.log('发送请求:', {
            url: config.baseURL + config.url,
            method: config.method,
            withCredentials: config.withCredentials,
            headers: config.headers
          });
        }

        return config;
      },
      (error: any) => {
        message.error(error);

        return Promise.reject(error);
      }
    );

    /**
     * @description 响应拦截器
     */
    this.service.interceptors.response.use(
      (response: AxiosResponse & { config: CustomAxiosRequestConfig }) => {
        const { data, config } = response;

        const userStore = useUserStore();

        config.loading && userStore.setLoading(false);

        hasShown401Message = false;

        return data;
      },
      (error: AxiosError) => {
        if (error.message.indexOf('timeout') !== -1) message.error('请求超时！请您稍后重试');
        if (error.message.indexOf('Network Error') !== -1) message.error('网络错误！请您稍后重试');
        if (error.message.indexOf('401') !== -1) {
          if (!hasShown401Message) {
            hasShown401Message = true;
            const userStore = useUserStore();

            userStore.removeCurrentUser();

            message.error('Login authentication has expired. Please log in again.', {
              closable: true,
              duration: 5000
            });
          }
        }

        return Promise.reject(error);
      }
    );
  }

  get(url: string, params?: object, _object = {}): Promise<any> {
    return this.service.get(url, { params, ..._object, withCredentials: true });
  }

  post<T>(url: string, params?: object | string, _object = {}): Promise<ResultData<T>> {
    return this.service.post(url, params, { ..._object, withCredentials: true });
  }

  put<T>(url: string, params?: object, _object = {}): Promise<ResultData<T>> {
    return this.service.put(url, params, { ..._object, withCredentials: true });
  }

  delete<T>(url: string, params?: any, _object = {}): Promise<ResultData<T>> {
    return this.service.delete(url, { params, ..._object, withCredentials: true });
  }
}

export default new RequestHttp(config);
