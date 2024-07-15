import http from '@/API';
import type { Tree } from '@/API/interface';

export const getTreeSource = (async: Boolean): Promise<Tree[]> => {
  const syncUrl = '/api/v1/perms/users/self/nodes/all-with-assets/tree/';
  const asyncUrl = '/api/v1/perms/users/self/nodes/children-with-assets/tree/';

  const url = async ? asyncUrl : syncUrl;

  return http.get(url, { observe: 'response' });
};

/**
 * @description 通过 id 获取资产详情
 * @param {string} id
 */
export const getTreeDetailById = (id: string) => {
  const url = `/api/v1/perms/users/self/assets/${id}/`;
  return http.get(url);
};

/**
 * @description 搜索栏根据关键字过滤资产
 * @param {string} keyword
 */
export const getTreeDetailBySearch = (keyword: string): Promise<Tree[]> => {
  const url = `/api/v1/perms/users/self/assets/tree/?search=${keyword}`;
  return http.get(url);
};

/**
 * @description
 * @param {string} id
 */
export const getGrantedTreeDetailById = (id: string): Promise<Tree[]> => {
  const url = `/api/v1/perms/users/self/assets/tree/?id=${id}`;
  return http.get(url);
};
