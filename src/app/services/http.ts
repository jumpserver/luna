import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams, HttpErrorResponse} from '@angular/common/http';
import {Browser} from '@app/globals';
import {retryWhen, delay, scan, map, catchError} from 'rxjs/operators';
import {
  Account, TreeNode, User as _User, Session,
  ConnectionToken, Endpoint, ConnectData, Asset
} from '@app/model';
import {User} from '@app/globals';
import {getCsrfTokenFromCookie, getQueryParamFromURL} from '@app/utils/common';
import {Observable, throwError} from 'rxjs';
import {I18nService} from '@app/services/i18n';
import {CookieService} from 'ngx-cookie-service';
import {encryptPassword} from '@app/utils/crypto';

@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient,
    private _i18n: I18nService,
    private _cookie: CookieService) {}

  setOptionsCSRFToken(options) {
    const csrfToken = getCsrfTokenFromCookie();
    if (!options) { options = {}; }
    let headers = options.headers || new HttpHeaders();
    headers = headers.set('X-CSRFToken', csrfToken);
    options.headers = headers;
    return options;
  }

  setOrgIDToRequestHeader(url, options) {
    if (!options) { options = {}; }
    const headers = options.headers || new HttpHeaders();
    const orgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    options.headers = headers.set('X-JMS-ORG', orgID);
    return options;
  }

  get<T>(url: string, options?: any): Observable<any> {
    options = this.setOrgIDToRequestHeader(url, options);
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

  put<T>(url: string, body?: any, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.put(url, body, options).pipe(
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
    let url = '/api/v1/users/profile/';
    const connectionToken = getQueryParamFromURL('token');
    if (connectionToken) {
      // 解决 /luna/connect?connectToken= 直接方式权限认证问题
      url += `?token=${connectionToken}`;
    }
    return this.get<_User>(url);
  }

  getMyGrantedAssets(keyword) {
    const url = `/api/v1/perms/users/self/assets/tree/?search=${keyword}`;
    return this.get<Array<TreeNode>>(url);
  }

  filterMyGrantedAssetsById(id: string) {
    const url = `/api/v1/perms/users/self/assets/tree/?id=${id}`;
    return this.get<Array<TreeNode>>(url);
  }

  withRetry() {
    return retryWhen(err => err.pipe(
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
    ));
  }

  getMyGrantedNodes(async: boolean) {
    const syncUrl = '/api/v1/perms/users/self/nodes/all-with-assets/tree/';
    const asyncUrl = '/api/v1/perms/users/self/nodes/children-with-assets/tree/';
    const url = async ? asyncUrl : syncUrl;
    return this.get<Array<TreeNode>>(url).pipe(this.withRetry());
  }

  getMyGrantedK8sNodes(treeId: string, async: boolean) {
    const url = `/api/v1/perms/users/self/nodes/children-with-k8s/tree/?tree_id=${treeId}&async=${async}`;
    return this.get<Array<TreeNode>>(url);
  }

  getMyAssetAccounts(assetId: string) {
    const url = `/api/v1/perms/users/self/assets/${assetId}/accounts/`;
    return this.get<Array<Account>>(url);
  }

  getAssetDetail(id) {
    const url = `/api/v1/perms/users/self/assets/?id=${id}`;
    return this.get<Asset>(url).pipe(map(res => res[0]));
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
      return this.delete(`${url}?asset=${assetId}`);
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

  createConnectToken(asset: Asset, connectData: ConnectData, createTicket = false) {
    const params = createTicket ? '?create_ticket=1' : '';
    const url = '/api/v1/authentication/connection-token/' + params;
    const { account, protocol, manualAuthInfo, connectMethod } = connectData;
    const username = account.username.startsWith('@') ? manualAuthInfo.username : account.username;
    const secret = encryptPassword(manualAuthInfo.secret);
    const data = {
      asset: asset.id,
      account: account.alias,
      protocol: protocol.name,
      input_username: username,
      input_secret: secret,
      connect_method: connectMethod.value,
    };
    return this.post<ConnectionToken>(url, data);
  }

  getConnectToken(token) {
    const url = new URL(`/api/v1/authentication/connection-token/${token}/`, window.location.origin);
    return this.get(url.href);
  }

  downloadRDPFile(token, params: Object) {
    const url = new URL(`/api/v1/authentication/connection-token/${token.id}/rdp-file/`, window.location.origin);
    params = this.cleanRDPParams(params);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.append(k, v);
      }
    }
    return window.open(url.href);
  }

  getLocalClientUrl(token) {
    const url = new URL(`/api/v1/authentication/connection-token/${token.id}/client-url/`, window.location.origin);
    return this.get(url.href);
  }

  getSmartEndpoint({ assetId, sessionId, token }, protocol ): Promise<Endpoint> {
    const url = new URL('/api/v1/terminal/endpoints/smart/', window.location.origin);

    url.searchParams.append('protocol', protocol);
    if (assetId) {
      url.searchParams.append('asset_id', assetId);
    } else if (sessionId) {
      url.searchParams.append('session_id', sessionId);
    } else if (token) {
      url.searchParams.append('token', token);
    }
    return this.get(url.href).pipe(map(res => Object.assign(new Endpoint(), res))).toPromise();
  }
}
