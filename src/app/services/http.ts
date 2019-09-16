import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Browser, DataStore} from '@app/globals';
import {GuacObjAddResp, SystemUser, TreeNode, User as _User} from '@app/model';


@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient) {
  }

  get(url: string, options?: any) {
    return this.http.get(url, options);
  }

  post(url: string, options?: any) {
    return this.http.post(url, options);
  }

  put(url: string, options?: any) {
    return this.http.put(url, options);
  }

  delete(url: string, options?: any) {
    return this.http.delete(url, options);
  }

  patch(url: string, options?: any) {
    return this.http.patch(url, options);
  }

  head(url: string, options?: any) {
    return this.http.head(url, options);
  }

  options(url: string, options?: any) {
    return this.http.options(url, options);
  }

  reportBrowser() {
    return this.http.post('/api/browser', JSON.stringify(Browser));
  }

  checkLogin(user: any) {
    return this.http.post('/api/checklogin', user);
  }

  getUserProfile() {
    return this.http.get<_User>('/api/users/v1/profile/');
  }

  getMyGrantedAssets(keyword) {
    const url = `/api/perms/v1/users/assets/tree/?search=${keyword}`;
    return this.http.get<Array<TreeNode>>(url);
  }

  filterMyGrantedAssetsById(id: string) {
    const url = `/api/perms/v1/users/assets/tree/?id=${id}`;
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyGrantedNodes(async: boolean, refresh?: boolean) {
    const cachePolicy = refresh ? '2' : '1';
    const syncUrl = `/api/perms/v1/users/nodes-with-assets/tree/?cache_policy=${cachePolicy}`;
    const asyncUrl = `/api/perms/v1/users/nodes/children-with-assets/tree/?cache_policy=${cachePolicy}`;
    const url = async ? asyncUrl : syncUrl;
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyGrantedRemoteApps(id?: string) {
    let url = '/api/perms/v1/user/remote-apps/tree/';
    if (id) {
      url += `?id=${id}&only=1`;
    }
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyRemoteAppSystemUsers(remoteAppId: string) {
    const url = `/api/v1/perms/users/remote-apps/${remoteAppId}/system-users/`;
    return this.http.get<Array<SystemUser>>(url);
  }

  getMyAssetSystemUsers(assetId: string) {
    const url = `/api/v1/perms/users/assets/${assetId}/system-users/`;
    return this.http.get<Array<SystemUser>>(url);
  }

  getGuacamoleToken(user_id: string, authToken: string) {
    const body = new HttpParams()
      .set('username', user_id)
      .set('password', 'jumpserver')
      .set('asset_token', authToken);
//  {
// "authToken": "xxxxxxx",
// "username": "xxxxxx",
// "dataSource": "jumpserver",
// "availableDataSources":[
// "jumpserver"
// ]
// }
    return this.http.post('/guacamole/api/tokens',
      body.toString(),
      {headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded')});
  }

  guacamoleAddAsset(userId: string, assetId: string, systemUserId: string, systemUserUsername?: string, systemUserPassword?: string) {
    let params = new HttpParams()
      .set('user_id', userId)
      .set('asset_id', assetId)
      .set('system_user_id', systemUserId)
      .set('token', DataStore.guacamoleToken);
    let body = new HttpParams();
    if (systemUserUsername && systemUserPassword) {
      systemUserUsername = btoa(systemUserUsername);
      systemUserPassword = btoa(systemUserPassword);
      body = body.set('username', systemUserUsername).set('password', systemUserPassword);
    }
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }

    return this.http.post<GuacObjAddResp>(
      '/guacamole/api/session/ext/jumpserver/asset/add',
      body.toString(),
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  guacamoleAddRemoteApp(userId: string, remoteAppId: string, sysUserId: string, systemUserUsername?: string, systemUserPassword?: string) {
    let params = new HttpParams()
      .set('user_id', userId)
      .set('remote_app_id', remoteAppId)
      .set('system_user_id', sysUserId)
      .set('token', DataStore.guacamoleToken);
    let body = new HttpParams();
    if (systemUserUsername && systemUserPassword) {
      systemUserUsername = btoa(systemUserUsername);
      systemUserPassword = btoa(systemUserPassword);
      body = body.set('username', systemUserUsername).set('password', systemUserPassword);
    }
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }

    return this.http.post<GuacObjAddResp>(
      '/guacamole/api/session/ext/jumpserver/remote-app/add',
      body.toString(),
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  guacamoleTokenAddAsset(assetToken: string, token: string) {
    let params = new HttpParams()
      .set('asset_token', assetToken)
      .set('token', token);
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }
    return this.http.get(
      '/guacamole/api/ext/jumpserver/asset/token/add',
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  search(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get('/api/search', {params: params});
  }

  getReplay(token: string) {
    return this.http.get('/api/terminal/v1/sessions/' + token + '/replay');
  }

  // get_replay_json(token: string) {
  //   return this.http.get('/api/terminal/v2/sessions/' + token + '/replay');
  // }

  getReplayData(src: string) {
    return this.http.get(src);
  }

  getUserIdFromToken(token: string) {
    const params = new HttpParams()
      .set('user-only', '1')
      .set('token', token);
    return this.http.get('/api/users/v1/connection-token/', {params: params});
  }

}
