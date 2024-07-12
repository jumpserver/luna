import http from '@/API';
import type { Tree } from '@/API/interface';

export const getTreeSource = (async: Boolean): Promise<Tree[]> => {
  const syncUrl = '/api/v1/perms/users/self/nodes/all-with-assets/tree/';
  const asyncUrl = '/api/v1/perms/users/self/nodes/children-with-assets/tree/';

  const url = async ? asyncUrl : syncUrl;

  return http.get(url, { observe: 'response' });
};
