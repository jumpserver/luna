import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpHeaders, HttpParams} from '@angular/common/http';
import {Browser, User} from '@app/globals';
import {catchError, delay, map, retryWhen, scan} from 'rxjs/operators';
import {Asset, ConnectData, ConnectionToken, Endpoint, Session, Ticket, TreeNode, User as _User} from '@app/model';
import {getCsrfTokenFromCookie, getQueryParamFromURL} from '@app/utils/common';
import {Observable} from 'rxjs';
import {I18nService} from '@app/services/i18n';
import {CookieService} from 'ngx-cookie-service';
import {encryptPassword} from '@app/utils/crypto';

@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient,
              private _i18n: I18nService,
              private _cookie: CookieService) {
  }

  setOptionsCSRFToken(options) {
    const csrfToken = getCsrfTokenFromCookie();
    if (!options) {
      options = {};
    }
    let headers = options.headers || new HttpHeaders();
    headers = headers.set('X-CSRFToken', csrfToken);
    options.headers = headers;
    return options;
  }

  setOrgIDToRequestHeader(url, options) {
    if (!options) {
      options = {};
    }
    const headers = options.headers || new HttpHeaders();
    if (!headers.get('X-JMS-ORG')) {
      const orgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
      options.headers = headers.set('X-JMS-ORG', orgID);
    }
    return options;
  }

  getJMSOrg() {
    return new HttpHeaders().set('X-JMS-ORG', this._cookie.get('X-JMS-ORG'));
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
        window.open('/core/auth/login/?next=/luna/', '_blank');
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

  patch<T>(url: string, body?: any, options?: any): Observable<any> {
    options = this.setOptionsCSRFToken(options);
    return this.http.patch(url, body, options).pipe(
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

  getUserSession() {
    const url = '/api/v1/authentication/user-session/';
    return this.get<_User>(url);
  }

  deleteUserSession() {
    const url = '/api/v1/authentication/user-session/';
    return this.delete<_User>(url);
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
    return this.get(url, {observe: 'response'}).pipe(this.withRetry());
  }

  getAssetTypeTree(async: boolean) {
    const isSync = !async ? 1 : 0;
    const url = `/api/v1/perms/users/self/nodes/children-with-assets/category/tree/?sync=${isSync}`;
    return this.get<Array<TreeNode>>(url, {observe: 'response'}).pipe(this.withRetry());
  }

  getAssetDetail(id) {
    const url = `/api/v1/perms/users/self/assets/${id}/`;
    return this.get<Asset>(url);
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
    return this.get(
      `/api/v1/terminal/sessions/${sessionId}/replay/`, {headers: this.getJMSOrg()}
    );
  }

  getPartFileReplay(sessionId: string, filename: string) {
    const params = new HttpParams().set('part_filename', filename);
    return this.get(
      `/api/v1/terminal/sessions/${sessionId}/replay/`, {headers: this.getJMSOrg(), params: params}
    );
  }

  getSessionDetail(sid: string): Promise<Session> {
    return this.get<Session>(
      `/api/v1/terminal/sessions/${sid}/`, {headers: this.getJMSOrg()}
    ).toPromise();
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
    return this.get(
      '/api/v1/terminal/commands/', {params: params, headers: this.getJMSOrg()}
    );
  }

  cleanRDPParams(params) {
    const cleanedParams = {};
    const {rdp_resolution, rdp_client_option, rdp_smart_size, rdp_color_quality} = params.graphics;

    if (rdp_resolution && rdp_resolution.indexOf('x') > -1) {
      const [width, height] = rdp_resolution.split('x');
      cleanedParams['width'] = width;
      cleanedParams['height'] = height;
    }
    if (rdp_client_option.includes('full_screen')) {
      cleanedParams['full_screen'] = '1';
    }
    if (rdp_client_option.includes('multi_screen')) {
      cleanedParams['multi_mon'] = '1';
    }
    if (rdp_client_option.includes('drives_redirect')) {
      cleanedParams['drives_redirect'] = '1';
    }

    cleanedParams['rdp_smart_size'] = rdp_smart_size;
    cleanedParams['rdp_color_quality'] = rdp_color_quality;
    return cleanedParams;
  }

  createConnectToken(asset: Asset, connectData: ConnectData, createTicket = false) {
    const params = createTicket ? '?create_ticket=1' : '';
    const url = '/api/v1/authentication/connection-token/' + params;
    const {account, protocol, manualAuthInfo, connectMethod} = connectData;
    const username = account.username.startsWith('@') ? manualAuthInfo.username : account.username;
    const secret = encryptPassword(manualAuthInfo.secret);
    const connectOption = connectData.connectOption;
    const data = {
      asset: asset.id,
      account: account.alias,
      protocol: protocol.name,
      input_username: username,
      input_secret: secret,
      connect_method: connectMethod.value,
      connect_options: connectOption
    };
    return this.post<ConnectionToken>(url, data).pipe(
      catchError(this.handleConnectMethodExpiredError.bind(this))
    );
  }

  exchangeConnectToken(tokenID: string, createTicket = false) {
    const params = createTicket ? '?create_ticket=1' : '';
    const url = '/api/v1/authentication/connection-token/exchange/' + params;
    const data = {'id': tokenID};
    return this.post<ConnectionToken>(url, data);
  }

  getConnectToken(token) {
    const url = new URL(`/api/v1/authentication/connection-token/${token}/`, window.location.origin);
    return this.get(url.href);
  }

  downloadRDPFile(token, params: Object, connectOption: any) {
    const url = new URL(`/api/v1/authentication/connection-token/${token.id}/rdp-file/`, window.location.origin);
    params = this.cleanRDPParams(params);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.append(k, v);
      }
    }
    if (connectOption && connectOption.reusable) {
      url.searchParams.append('reusable', '1');
    }
    return window.open(url.href);
  }

  getLocalClientUrl(token, params: Object = {}) {
    const url = new URL(`/api/v1/authentication/connection-token/${token.id}/client-url/`, window.location.origin);
    params = this.cleanRDPParams(params);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.append(k, v);
      }
    }
    return this.get(url.href).pipe(
      catchError(this.handleConnectMethodExpiredError.bind(this))
    );
  }

  getLocalClientUrlAndSetCommand(token, command: string, params: Object = {}) {
    const setCommand = (res) => {
      const protocol = 'jms://';
      const buf = res.url.replace(protocol, '');
      const bufObj = JSON.parse(window.atob(buf));
      bufObj['command'] = command;
      const bufStr = window.btoa(JSON.stringify(bufObj));
      res.url = protocol + bufStr;
      return res;
    };
    return new Promise((resolve, reject) => {
      this.getLocalClientUrl(token, params).subscribe(
        res => resolve(setCommand(res)),
        err => reject(err)
      );
    });
  }

  async handleConnectMethodExpiredError(error) {
    if (error.status === 400) {
      if (error.error && error.error.error && error.error.error.startsWith('Connect method')) {
        const errMsg = await this._i18n.t('The connection method is invalid, please refresh the page');
        alert(errMsg);
      }
    }
    throw error;
  }

  getSmartEndpoint({assetId, sessionId, token}, protocol): Promise<Endpoint> {
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

  getTicketDetail(ticketId: string): Promise<Ticket> {
    const url = `/api/v1/tickets/tickets/${ticketId}/`;
    return this.get<Ticket>(url).toPromise();
  }

  toggleLockSession(sessionId: string, lock: boolean): Promise<any> {
    const url = `/api/v1/terminal/tasks/toggle-lock-session/`;
    const taskName = lock ? 'lock_session' : 'unlock_session';
    const data = {
      session_id: sessionId,
      task_name: taskName
    };
    return this.post(url, data).toPromise();
  }

  toggleLockSessionForTicket(ticketId: string, sessionId: string, lock: boolean): Promise<any> {
    const url = `/api/v1/terminal/tasks/toggle-lock-session-for-ticket/`;
    const taskName = lock ? 'lock_session' : 'unlock_session';
    const data = {
      session_id: sessionId,
      task_name: taskName
    };
    return this.post(url, data).toPromise();
  }

  getQuickCommand() {
    const url = '/api/v1/ops/adhocs/?only_mine=true';
    return this.get(url).toPromise();
  }

  addQuickCommand(data) {
    const url = '/api/v1/ops/adhocs/';
    return this.post(url, data);
  }

  getSessionOnlineNum(assetId: string, account: string) {
    const url = `/api/v1/terminal/sessions/online-info/?asset_id=${assetId}&account=${account}`;
    return this.get(url);
  }
}
