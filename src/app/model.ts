
export class SystemUser {
  id: string;
  name: string;
  login_mode: string;
  username: string;
  priority: number;
  protocol: string;
  password: string;
  actions: Array<string>;
}

export class TreeNode {
  id: string;
  name: string;
  comment: string;
  title: string;
  isParent: boolean;
  pId: string;
  open: boolean;
  iconSkin: string;
  meta: any;
}

export class Node {
  id: string;
  key: string;
  value: string;
}

export class Asset {
  id: string;
  hostname: string;
  ip: string;
  comment: string;
  domain: string;
  os: string;
  platform: string;
  protocols: Array<string>;
}

export class GuacObjAddResp {
  code: number;
  result: string;
}
