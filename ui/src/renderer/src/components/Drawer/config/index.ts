import type { Ref } from 'vue';

import { ref } from 'vue';

export interface IClient {
  path: string;
  comment: {
    en: string;
    zh: string;
  };
  name: string;
  display_name: string;
  download_url: string;
  protocol: any;
  arg_format: string;
  type: string;
  match_first: any;
  is_internal: boolean;
  is_set: boolean;
  is_default: boolean;
}

export const linuxOptions: Ref<Array<IClient>> = ref([]);

export const windowsOptions: Ref<Array<IClient>> = ref([]);

export const databaseOptions: Ref<Array<IClient>> = ref([]);

export const charsetOptions = [
  { label: 'Default', value: 'default' },
  { label: 'UTF-8', value: 'utf8' },
  { label: 'GBK', value: 'gbk' },
  { label: 'GB2312', value: 'gb2312' },
  { label: 'IOS-8859-1', value: 'ios-8859-1' },
];

export const resolutionsOptions = [
  { label: 'Auto', value: 'auto' },
  { label: '1024x768', value: '1024x768' },
  { label: '1366x768', value: '1366x768' },
  { label: '1600x900', value: '1600x900' },
  { label: '1920x1080', value: '1920x1080' },
];

export const boolOptions = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];
