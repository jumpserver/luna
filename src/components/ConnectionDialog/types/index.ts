export interface Protocol {
  name: string;
  port: number;
  public: boolean;
  setting: {
    sftp_enabled: boolean;
    sftp_home: string;
  };
}
export interface connectMethodItem {
  component: string;
  endpoint_protocol: string;
  label: string;
  type: string;
  value: string;
  disabled?: boolean;
}
export interface ConnectData {
  asset: Asset;
  account: Account;
  protocol: Protocol;
  manualAuthInfo: AuthInfo;
  connectMethod: connectMethodItem;
  connectOption: Object;
  downloadRDP: boolean;
  autoLogin: boolean;
}
export interface Account {
  alias: string;
  name: string;
  username: string;
  has_secret: boolean;
  secret: string;
  actions: Array<Action>;
}
export interface Action {
  label: string;
  value: string;
}
export interface Choice {
  label: string;
  value: string;
}
export interface SpecInfo {
  db_name?: string;
}
export interface Asset {
  id: string;
  name: string;
  address: string;
  comment: string;
  type: Choice;
  category: Choice;
  permed_protocols: Array<Protocol>;
  permed_accounts: Array<Account>;
  spec_info: SpecInfo;
}
export interface AuthInfo {
  alias: string;
  username: string;
  secret: string;
  rememberAuth: boolean;
}
