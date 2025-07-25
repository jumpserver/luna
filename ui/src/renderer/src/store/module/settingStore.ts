import type { ISetting } from '@renderer/store/interface';

import { defineStore } from 'pinia';
import { piniaPersistConfig } from '@renderer/store/helper';

export const useSettingStore = defineStore('setting', {
  state: (): Partial<ISetting> => ({
    charset: 'default',
    is_backspace_as_ctrl_h: false,
    rdp_resolution: 'auto',
    keyboard_layout: 'en-us-qwerty',
    rdp_client_option: [],
    rdp_color_quality: '32',
    rdp_smart_size: '0',
  }),
  actions: {
    setCharset(charset: string) {
      this.charset = charset;
    },
    setRdpResolution(rdp_resolution: string) {
      this.rdp_resolution = rdp_resolution;
    },
    setBackspaceAsCtrlH(is_backspace_as_ctrl_h: boolean) {
      this.is_backspace_as_ctrl_h = is_backspace_as_ctrl_h;
    },
    setKeyboardLayout(layout: string) {
      this.keyboard_layout = layout;
    },
    setRdpClientOption(options: string[]) {
      this.rdp_client_option = options;
    },
    setRdpColorQuality(quality: string) {
      this.rdp_color_quality = quality;
    },
    setRdpSmartSize(size: string) {
      this.rdp_smart_size = size;
    },
  },
  persist: piniaPersistConfig('setting'),
});
