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

let hasShown401Message = false;
let isProcessing401 = false; // 防止401错误连锁处理
let lastUserSwitchTime = 0; // 记录最后一次用户切换时间
let isRemovingUser = false; // 防止在删除用户过程中触发401处理

// 导出更新用户切换时间的函数
export const updateUserSwitchTime = () => {
  lastUserSwitchTime = Date.now();
}; // 放在模块最顶层，作用域全局共享

// 导出设置用户删除状态的函数
export const setUserRemoving = (removing: boolean) => {
  isRemovingUser = removing;
};

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
          const currentTime = Date.now();
          const timeSinceLastSwitch = currentTime - lastUserSwitchTime;

          if (!hasShown401Message && !isProcessing401) {
            const userStore = useUserStore();

            // 增加多重保护条件：
            // 1. 用户切换后10秒内不处理401
            // 2. 正在删除用户时不处理401
            // 3. 确保有当前用户才处理401
            if (timeSinceLastSwitch < 10000 || isRemovingUser || !userStore.currentUser?.session) {
              return Promise.reject(error);
            }

            hasShown401Message = true;
            isProcessing401 = true;

            // 使用新的401错误处理接口
            if (userStore.currentUser?.session && userStore.currentUser?.currentSite) {
              const currentSession = userStore.currentUser.session;
              const currentSite = userStore.currentUser.currentSite;

              // 调用主进程的401错误处理接口
              window.electron.ipcRenderer.invoke('handle-401-error', currentSite, currentSession)
                .then(result => {
                  if (result.success) {
                    console.log('401错误处理成功:', result.message);
                  } else {
                    console.error('401错误处理失败:', result.error);
                  }
                })
                .catch(error => {
                  console.error('调用401错误处理接口失败:', error);
                });

              // 继续执行原有的用户删除逻辑
              userStore
                .removeUserBySession(currentSession)
                .catch(error => {
                  console.error('删除过期用户失败:', error);
                })
                .finally(() => {
                  // 重置处理状态，但延迟一段时间避免连锁反应
                  setTimeout(() => {
                    isProcessing401 = false;
                    hasShown401Message = false;
                  }, 3000);
                });
            } else {
              // 如果没有当前用户，立即重置状态
              isProcessing401 = false;
              hasShown401Message = false;
            }

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
