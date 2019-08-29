export class View {
  id: string;
  nick: string;
  type: string;
  editable: boolean;
  active: boolean;
  connected: boolean;
  hide: boolean;
  closed: boolean;
  host: any;
  user: any;
  remoteApp: string;
  room: string;
  Rdp: any;
  Term: any;
}

export class ViewAction {
  view: View;
  name: string;

  constructor(view: View, name: string) {
    this.view = view;
    this.name = name;
  }
}
