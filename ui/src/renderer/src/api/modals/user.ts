import request from '../index';

export const getProfile = () => {
  return request.get('/api/v1/users/profile/');
};

export const getOrganization = () => {
  return request.get('/api/v1/users/profile/permissions/');
};

export const getCurrent = () => {
  return request.get('/api/v1/orgs/orgs/current/');
};
