import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams, HttpErrorResponse} from '@angular/common/http';
import {Browser} from '@app/globals';
import {retryWhen, delay, scan, map, retry, catchError} from 'rxjs/operators';
import {SystemUser, TreeNode, User as _User, Session, ConnectionToken, Endpoint} from '@app/model';
import {User} from '@app/globals';
import {getCookie} from '@app/utils/common';
import {Observable, throwError} from 'rxjs';
import {I18nService} from '@app/services/i18n';
import {aesEncryptByCsrf} from '@app/utils/crypto';


@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient, private _i18n: I18nService) {}

  setOptionsCSRFToken(options) {
    const csrfToken = getCookie('csrftoken');
    if (!options) { options = {}; }
    let headers = options.headers || new HttpHeaders();
    headers = headers.set('X-CSRFToken', csrfToken);
    options.headers = headers;
    return options;
  }

  setOptionsRootOrgIfNeed(url, options) {
    if (!options) { options = {}; }
    let headers = options.headers || new HttpHeaders();
    const rootOrgUrls = ['/api/v1/perms', '/api/v1/assets/favorite-assets/'];
    const toRootOrg = rootOrgUrls.some((i) => url.indexOf(i) > -1);
    if (toRootOrg) {
      headers = headers.set('X-JMS-ORG', 'ROOT');
    }
    options.headers = headers;
    return options;
  }

  get<T>(url: string, options?: any): Observable<any> {
    options = this.setOptionsRootOrgIfNeed(url, options);
    return this.http.get(url, options).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  async handleError(error: HttpErrorResponse) {
    if (error.status === 401 && User.logined) {
      const msg = await this._i18n.t('LoginExpireMsg');
      if (confirm(msg)) {
        window.open('/core/auth/login/?next=/luna/');
      }
    } else if (error.status === 403) {
      const msg = await this._i18n.t('No permission');
      alert(msg);
      throw error;
    } else {
      // The backend returned an unsuccessful response code.
      // The response body may contain clues as to what went wrong.
      console.error(`Backend returned code ${error.status}, body was: `, error.error);
      throw error;
    }
  }

  post<T>(url: string, body: any, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.post(url, body, options).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  put<T>(url: string, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.put(url, options).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  delete<T>(url: string, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.delete(url, options).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  patch<T>(url: string, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.patch(url, options).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  head<T>(url: string, options?: any) {
    return this.http.head(url, options);
  }

  options(url: string, options?: any) {
    return this.http.options(url, options);
  }

  reportBrowser() {
    return this.post('/api/browser', JSON.stringify(Browser));
  }

  checkLogin(user: any) {
    return this.post('/api/checklogin', user);
  }

  getUserProfile() {
    return this.get<_User>('/api/v1/users/profile/');
  }

  getMyGrantedAssets(keyword) {
    const url = `/api/v1/perms/users/assets/tree/?search=${keyword}`;
    return this.get<Array<TreeNode>>(url);
  }

  filterMyGrantedAssetsById(id: string) {
    const url = `/api/v1/perms/users/assets/tree/?id=${id}`;
    return this.get<Array<TreeNode>>(url);
  }

  getMyGrantedNodes(async: boolean, refresh?: boolean) {
    const syncUrl = `/api/v1/perms/users/nodes-with-assets/tree/`;
    const asyncUrl = `/api/v1/perms/users/nodes/children-with-assets/tree/`;
    const url = async ? asyncUrl : syncUrl;
    return this.get<Array<TreeNode>>(url).pipe(
      retryWhen(err => err.pipe(
        scan(
          (retryCount, _err) => {
            if (retryCount > 10) {
              throw _err;
            } else {
              return retryCount + 1;
            }
          }, 0
        ),
        delay(10000)
      )));
  }

  getMyGrantedAppsNodes() {
    const url = '/api/v1/perms/users/applications/tree/';
    return this.get<Array<TreeNode>>(url);
  }

  getMyGrantedAppNodesDetail(id: string) {
    const url = `/api/v1/perms/users/applications/tree/?id=${id}`;
    return this.get<Array<TreeNode>>(url).pipe(
      map(nodes => nodes.filter(node => node.id === id))
    );
  }

  getMyAppSystemUsers(remoteAppId: string) {
    const url = `/api/v1/perms/users/applications/${remoteAppId}/system-users/`;
    return this.get<Array<SystemUser>>(url);
  }

  getMyAssetSystemUsers(assetId: string) {
    const url = `/api/v1/perms/users/assets/${assetId}/system-users/`;
    return this.get<Array<SystemUser>>(url);
  }

  favoriteAsset(assetId: string, favorite: boolean) {
    let url: string;
    url = `/api/v1/assets/favorite-assets/`;
    if (favorite) {
      const data = {
        asset: assetId
      };
      return this.post(url, data);
    } else {
      return this.delete(`${url}&asset=${assetId}`);
    }
  }

  getFavoriteAssets() {
    const url = '/api/v1/assets/favorite-assets/';
    return this.get<Array<any>>(url);
  }

  search(q: string) {
    const params = new HttpParams().set('q', q);
    return this.get('/api/search', {params: params});
  }

  getReplay(sessionId: string) {
    return this.get(`/api/v1/terminal/sessions/${sessionId}/replay/`);
  }

  getSessionDetail(sid: string): Promise<Session> {
    return this.get<Session>(`/api/v1/terminal/sessions/${sid}/`).toPromise();
  }

  getReplayData(src: string) {
    return this.get(src);
  }

  getCommandsData(sid: string, page: number) {
    const params = new HttpParams()
    .set('session_id', sid)
    .set('limit', '30')
    .set('offset', String(30 * page))
    .set('order', 'timestamp');
    return this.get('/api/v1/terminal/commands/', {params: params});
  }

  getUserIdFromToken(token: string) {
    const params = new HttpParams()
      .set('user-only', '1')
      .set('token', token);
    return this.get('/api/v1/users/connection-token/', {params: params});
  }

  cleanRDPParams(params) {
    const cleanedParams = {};
    const {rdpResolution, rdpFullScreen, rdpDrivesRedirect } = params;

    if (rdpResolution && rdpResolution.indexOf('x') > -1) {
      const [width, height] = rdpResolution.split('x');
      cleanedParams['width'] = width;
      cleanedParams['height'] = height;
    }
    if (rdpFullScreen) {
      cleanedParams['full_screen'] = '1';
    }
    if (rdpDrivesRedirect) {
      cleanedParams['drives_redirect'] = '1';
    }
    return cleanedParams;
  }

  downloadRDPFile({assetId, appId, systemUserId}, params: Object) {
    const url = new URL('/api/v1/authentication/connection-token/rdp/file/', window.location.origin);
    if (assetId) {
      url.searchParams.append('asset', assetId);
    } else {
      url.searchParams.append('application', appId);
    }
    url.searchParams.append('system_user', systemUserId);
    params = this.cleanRDPParams(params);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.append(k, v);
      }
    }
    return window.open(url.href);
  }

  getRDPClientUrl({assetId, appId, systemUserId}, params: Object) {
    const url = new URL('/api/v1/authentication/connection-token/client-url/', window.location.origin);
    const data = {};
    if (assetId) {
      data['asset'] = assetId;
    } else {
      data['application'] = appId;
    }
    data['system_user'] = systemUserId;
    params = this.cleanRDPParams(params);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.append(k, v);
      }
    }
    return this.post(url.href, data).toPromise();
  }

  createSystemUserTempAuth(systemUser: SystemUser, node: TreeNode, auth: any) {
    const url = `/api/v1/assets/system-users/${systemUser.id}/temp-auth/`;
    auth.password = aesEncryptByCsrf(auth.password);
    const data = {
      instance_id: node.id,
      protocol: systemUser.protocol,
      ...auth
    };
    return this.post(url, data).toPromise();
  }

  getConnectionToken(systemUserId: string, assetId: string, appId): Promise<ConnectionToken> {
    const url = '/api/v1/authentication/connection-token/';
    const data = {
      'system_user': systemUserId,
    };
    if (assetId) {
      data['asset'] = assetId;
    } else {
      data['application'] = appId;
    }
    return this.post(url, data).toPromise();
  }

  getEndpoint( { assetId, applicationId, sessionId, token }, protocol ): Promise<Endpoint> {
    const url = new URL('/api/v1/terminal/endpoints/connect-url/', window.location.origin);

    url.searchParams.append('protocol', protocol);
    if (assetId) {
      url.searchParams.append('asset_id', assetId);
    } else if (applicationId) {
      url.searchParams.append('application_id', applicationId);
    } else if (sessionId) {
      url.searchParams.append('session_id', sessionId);
    } else if (token) {
      url.searchParams.append('token', token);
    }
    return this.get(url.href).toPromise();
  }
}
