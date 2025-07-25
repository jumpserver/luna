import type { Ref } from 'vue';
import type { Emitter } from 'mitt';
import type { IItemDetail } from '@renderer/components/MainSection/interface';

import mitt from 'mitt';

interface Event {
  search: any;
  addAccount: any;
  changeTheme: any;
  changeLang: any;
  changeLayout: any;
  createDrawer: void;
  removeAccount: void;
  checkMatch: any;
  showAssetDetail: { detailMessage: Ref<IItemDetail> };
}

const mittBus: Emitter<Event> = mitt();

export default mittBus;
