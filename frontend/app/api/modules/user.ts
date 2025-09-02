import { request } from '..';

export const getProfile = () => {
  return request.get('/api/v1/users/profile/');
};
