import type {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { fetch } from '@tauri-apps/plugin-http';
import axios from 'axios';
import { useUserInfoStore } from '~/store/modules/userInfo';

const config = {
  timeout: 5000,
  withCredentials: false, // 在 Tauri 中手动设置 Cookie
};

class Request {
  public service: AxiosInstance;

  constructor(config: AxiosRequestConfig) {
    this.service = axios.create(config);

    this.service.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // 从 store 中获取当前站点信息以及 cookies 信息
        const userInfoStore = useUserInfoStore();

        const { getUserData } = userInfoStore;
        const { currentSite } = storeToRefs(userInfoStore);

        const userData = getUserData(currentSite.value);

        if (userData && userData.csrf_token && currentSite.value) {
          config.baseURL = currentSite.value;

          // 确保 headers 对象存在
          if (!config.headers) {
            config.headers = {};
          }

          // 设置必要的请求头
          config.headers.Cookie = userData.headerJson;
          config.headers['X-TZ'] =
            Intl.DateTimeFormat().resolvedOptions().timeZone;
          config.headers['X-CSRFToken'] = userData.csrf_token;
          config.headers['Content-Type'] = 'application/json';
          config.headers.Accept = 'application/json';
          config.headers.Referer = `${currentSite.value}/`;
          config.headers.Origin = currentSite.value;
          config.headers['User-Agent'] = 'TauriApp/1.0.0';

          console.log('🔧 API配置信息:');
          console.log('  - baseURL:', config.baseURL);
          console.log('  - Cookie:', config.headers.Cookie);
          console.log('  - X-CSRFToken:', config.headers['X-CSRFToken']);
          console.log('  - Referer:', config.headers.Referer);
          console.log('  - Origin:', config.headers.Origin);
        } else {
          console.warn('⚠️ API配置缺失:');
          console.log('  - userData:', userData);
          console.log('  - currentSite:', currentSite.value);
        }
        return config;
      }
    );
  }

  async get(url: string, params?: object, _object = {}): Promise<any> {
    // 获取用户信息
    const userInfoStore = useUserInfoStore();
    const { getUserData } = userInfoStore;
    const { currentSite } = storeToRefs(userInfoStore);

    const userData = getUserData(currentSite.value);

    if (!userData || !userData.csrf_token || !currentSite.value) {
      console.warn('⚠️ 缺少用户认证信息，使用 Axios 发送请求');
      return this.service.get(url, { params, ..._object });
    }

    // 构建完整的 URL
    const baseUrl = currentSite.value.endsWith('/')
      ? currentSite.value.slice(0, -1)
      : currentSite.value;

    const fullUrl = url.startsWith('/')
      ? `${baseUrl}${url}`
      : `${baseUrl}/${url}`;

    // 添加查询参数
    const urlObj = new URL(fullUrl);
    if (params) {
      Object.keys(params).forEach((key) => {
        urlObj.searchParams.append(key, params[key]);
      });
    }

    console.log('🌐 使用 Tauri fetch 发送请求:');
    console.log('  - URL:', urlObj.toString());
    console.log('  - Cookie:', userData.headerJson);
    console.log('  - X-CSRFToken:', userData.csrf_token);

    // 先测试基本连通性
    try {
      console.log('🔍 测试基本连通性...');
      const testResponse = await fetch(currentSite.value, { method: 'HEAD' });
      console.log('✅ 基本连通性测试成功:', testResponse.status);
    } catch (connectError) {
      console.error('❌ 基本连通性测试失败:', connectError);
    }

    try {
      console.log('🔄 使用自定义 Tauri HTTP 请求...');

      const headers = {
        Cookie: userData.headerJson,
        'X-CSRFToken': userData.csrf_token,
        'X-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Referer: `${currentSite.value}/`,
        Origin: currentSite.value,
        'User-Agent': 'TauriApp/1.0.0',
      };

      console.log('📋 请求头:', JSON.stringify(headers, null, 2));

      const data = await useTauriCoreInvoke('custom_http_request', {
        url: urlObj.toString(),
        method: 'GET',
        headers,
        body: null,
      });

      console.log('✅ 自定义请求成功:', data);
      return data;
    } catch (error) {
      console.error('❌ 自定义 HTTP 请求失败 - 详细错误:', error);
      console.error('❌ 错误类型:', typeof error);
      console.error('❌ 错误消息:', error.message);

      // 尝试回退到 Axios
      console.log('🔄 尝试回退到 Axios...');
      try {
        return await this.service.get(url, { params, ..._object });
      } catch (axiosError) {
        console.error('❌ Axios 也失败了:', axiosError);
        throw error; // 抛出原始错误
      }
    }
  }
}

export const request = new Request(config);
