import http from '@/API';

/**
 * @description获取当前用户信息
 */
export const getProfile = () => {
  return http.get('/api/v1/users/profile/');
};
