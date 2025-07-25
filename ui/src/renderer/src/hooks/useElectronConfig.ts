import { Conf } from 'electron-conf/renderer';

export interface IDefaultSetting {
  theme: string;
  layout: string;
  language: string;

  [key: string]: string;
}

export const useElectronConfig = () => {
  const conf = new Conf();

  /**
   * @description 获取默认设置
   */
  const getDefaultSetting = async () => {
    const res = (await conf.get('defaultSetting')) as IDefaultSetting;

    if (res) {
      return {
        theme: res?.theme,
        layout: res?.layout,
        language: res?.language,
      };
    }

    return {
      theme: 'light',
      layout: 'list',
      language: 'zh',
    };
  };

  /**
   * @description 设置默认设置
   */
  const setDefaultSetting = async (setting: Partial<IDefaultSetting>) => {
    const currentSettings = await getDefaultSetting();

    await conf.set('defaultSetting', {
      ...currentSettings,
      ...setting,
    });
  };

  return {
    getDefaultSetting,
    setDefaultSetting,
  };
};
