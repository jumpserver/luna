import type { ConfigProviderProps } from 'naive-ui';

import { computed, h, ref } from 'vue';
import { Conf } from 'electron-conf/renderer';
import {
  createDiscreteApi,
  darkTheme,
  lightTheme,
  NButton,
  NForm,
  NFormItem,
  NInput,
} from 'naive-ui';

export const useAccountModal = (type: string, t: any) => {
  const conf = new Conf();
  const defaultTheme = ref('');
  const inputPassword = ref('');
  const inputUsername = ref('');
  const confirmed = ref(false);

  conf.get('defaultSetting').then((res) => {
    if (res) {
      // @ts-ignore
      defaultTheme.value = res?.theme;
    }
  });

  const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
    theme: defaultTheme.value === 'light' ? lightTheme : darkTheme,
  }));

  const { modal } = createDiscreteApi(['modal'], {
    configProviderProps: configProviderPropsRef,
  });

  const modalTitle
    = type !== '@INPUT' ? t('Common.InputPassword') : t('Common.InputAccountPassword');

  const m = modal.create({
    title: modalTitle,
    preset: 'card',
    bordered: false,
    segmented: true,
    style: {
      width: '30rem',
      borderRadius: '10px',
    },
    content: () =>
      h(
        NForm,
        {
          labelPlacement: 'top',
          labelWidth: 80,
          size: 'small',
        },
        {
          default: () => [
            h(
              NFormItem,
              {
                label: t('Common.Username'),
                path: 'username',
                style: { display: type !== '@INPUT' ? 'none' : '' },
              },
              {
                default: () =>
                  h(NInput, {
                    value: inputUsername.value,
                    clearable: true,
                    placeholder: t('Common.UsernamePlaceholder'),
                    onUpdateValue: (value) => {
                      inputUsername.value = value;
                    },
                  }),
              },
            ),
            h(
              NFormItem,
              {
                label: t('Common.Password'),
                path: 'password',
              },
              {
                default: () =>
                  h(NInput, {
                    value: inputPassword.value,
                    type: 'password',
                    clearable: true,
                    showPasswordOn: 'click',
                    placeholder: t('Common.InputPassword'),
                    onUpdateValue: (value) => {
                      inputPassword.value = value;
                    },
                  }),
              },
            ),
            h(
              NFormItem,
              {
                style: {
                  display: 'flex',
                  justifyContent: 'flex-end',
                },
              },
              {
                default: () =>
                  h(
                    NButton,
                    {
                      type: 'primary',
                      size: 'medium',
                      onClick: () => {
                        confirmed.value = true;
                        m.destroy();
                      },
                    },
                    {
                      default: () => t('Common.Confirm'),
                    },
                  ),
              },
            ),
          ],
        },
      ),
  });

  return {
    inputPassword,
    inputUsername,
    confirmed,
  };
};
