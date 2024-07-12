import { h } from 'vue';
import SvgIcon from '@/components/SvgIcon/index.vue';

export enum AssetIconType {
  // 数据库类
  mysql = 'mysql',
  mariadb = 'mariadb',

  // 主机
  windows = 'windows',
  linux = 'linux',
  macos = 'macos',
  aix = 'aix',
  bsd = 'bsd',
  gatway = 'gatway',
  remoteapphost = 'remoteapphost'
}

export const AssetIconMap = {
  [AssetIconType.mysql]: h(SvgIcon, { name: 'mysql' }),
  [AssetIconType.mariadb]: h(SvgIcon, { name: 'mariadb' })
};
