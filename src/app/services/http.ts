import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams, HttpErrorResponse} from '@angular/common/http';
import {Browser} from '@app/globals';
import {retryWhen, delay, scan, map, retry, catchError} from 'rxjs/operators';
import {SystemUser, TreeNode, User as _User, Session} from '@app/model';
import {User} from '@app/globals';
import {getCookie} from '@app/utils/common';
import {Observable, throwError} from 'rxjs';
import {I18nService} from '@app/services/i18n';


@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient, private _i18n: I18nService) {}

  setOptionsCSRFToken(options) {
    const csrfToken = getCookie('csrftoken');
    let headers;
    if (!options) {
      options = {};
    }
    if (!options.headers) {
      headers = new HttpHeaders();
    } else {
      headers = options.headers;
    }
    headers = headers.set('X-CSRFToken', csrfToken);
    options.headers = headers;
    return options;
  }

  get<T>(url: string, options?: any): Observable<any> {
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
    const cachePolicy = refresh ? `2&rebuild_tree=1` : '1';
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
    if (favorite) {
      url = `/api/v1/assets/favorite-assets/`;
      const data = {
        asset: assetId
      };
      return this.post(url, data);
    } else {
      url = `/api/v1/assets/favorite-assets/?asset=${assetId}`;
      return this.delete(url);
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

  getCommandsData(sid:string, page: number) {
    const params = new HttpParams()
    .set('session_id', sid)
    .set('limit', '30')
    .set('offset', String(30 * page))
    .set('order', 'timestamp')
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

  createSystemUserTempAuth(systemUser: SystemUser, node: TreeNode, auth: object) {
    const url = `/api/v1/assets/system-users/${systemUser.id}/temp-auth/`;
    const data = {
      instance_id: node.id,
      ...auth
    };
    return this.post(url, data).toPromise();
  }
}
