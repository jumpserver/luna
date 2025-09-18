export default defineAppConfig({
  app: {
    name: 'JumpServer Client',
    author: 'ZhaoJiSen',
    version: '3.1.0',
    repo: 'https://github.com/jumpserver/clients',
  },
  componentsConfig: {
    header: {
      darkColor: '#3B3D3D',
      lightColor: '#F5F6F7',
    },
    pages: {
      focusColor: '#55B787',
      mainCardLightBackgroundColor: '#FAFAFA',
      mainCardDarkBackgroundColor: '#201f22',
    },
    operation: {
      lightColor: '#EBECED',
      darkColor: '#323232',
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
