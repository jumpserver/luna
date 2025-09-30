export default defineAppConfig({
  app: {
    name: 'JumpServer Client',
    author: 'ZhaoJiSen',
    version: '3.1.0',
    repo: 'https://github.com/jumpserver/clients',
  },
  componentsConfig: {
    header: {
      darkColor: '#333334',
      lightColor: '#E4E4E5',
    },
    pages: {
      focusColor: '#55B787',
      scrollBarLightThumbColor: '#D0D1D2',
      scrollBarDarkThumbColor: '#4A4A4A',
      scrollBarLightHoverColor: '#B8B9BA',
      scrollBarDarkHoverColor: '#6B6B6B',
      mainCardLightBackgroundColor: '#FAFAFA',
      mainCardDarkBackgroundColor: '#2C2C2C',
    },
    operation: {
      lightColor: '#F2F2F3',
      darkColor: '#3D3D3E',
    },
  },
  pageCategories: {
    system: {
      label: 'System',
      icon: 'lucide:square-terminal',
    },
    storage: {
      label: 'Storage',
      icon: 'lucide:archive',
    },
    interface: {
      label: 'Interface',
      icon: 'lucide:app-window-mac',
    },
    other: {
      label: 'Other',
      icon: 'lucide:folder',
    },
  },
  ui: {
    colors: {
      primary: 'green',
      neutral: 'zinc',
    },
    container: {
      base: 'mx-0 w-full',
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
    formField: {
      slots: {
        root: 'w-full',
      },
    },
    input: {
      slots: {
        root: 'w-full',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
        base: 'resize-none',
      },
    },
    accordion: {
      slots: {
        trigger: 'cursor-pointer',
        item: 'md:py-2',
      },
    },
    navigationMenu: {
      slots: {
        link: 'cursor-pointer',
      },
      variants: {
        disabled: {
          true: {
            link: 'cursor-text',
          },
        },
      },
    },
  },
});
