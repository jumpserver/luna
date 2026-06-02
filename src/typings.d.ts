/* SystemJS module definition */
declare var module: NodeModule;

interface NodeModule {
  id: string;
}
interface Window {
  __BASE_PATH__?: string;
  __UI_BASE__?: string;
  __LUNA_BASE__?: string;
}
