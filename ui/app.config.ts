export default defineAppConfig({
  app: {
    name: "JumpServer Client",
    author: "JumpServer",
    version: "3.1.0",
    repo: "https://github.com/jumpserver/clients"
  },
  componentsConfig: {
    header: {
      // 颜色现在通过 CSS 变量管理，在 main.css 中定义
      // 这里保留用于其他可能的配置
    },
    pages: {
      scrollBarLightThumbColor: "#D0D1D2",
      scrollBarDarkThumbColor: "#4A4A4A",
      scrollBarLightHoverColor: "#B8B9BA",
      scrollBarDarkHoverColor: "#6B6B6B",
      mainCardLightBackgroundColor: "#FAFAFA",
      mainCardDarkBackgroundColor: "#2C2C2C"
    },
    urlRegExp:
      /^(?:https?:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])$/
  },
  ui: {
    colors: {
      primary: "primary",
      neutral: "zinc"
    },
    container: {
      base: "mx-0 w-full"
    },
    button: {
      slots: {
        base: "cursor-pointer"
      },
      variants: {
        ghost: {
          neutral: {
            base: "bg-transparent hover:bg-gray-50"
          }
        }
      }
    },
    formField: {
      slots: {
        root: "w-full"
      }
    },
    input: {
      slots: {
        root: "w-full"
      }
    },
    textarea: {
      slots: {
        root: "w-full",
        base: "resize-none"
      }
    },
    accordion: {
      slots: {
        trigger: "cursor-pointer",
        item: "md:py-2"
      }
    },
    dropdownMenu: {
      slots: {
        content: "w-(--reka-dropdown-menu-trigger-width) p-1",
        item: "mx-0.5 px-3 py-2 rounded-md transition-colors duration-150",
      }
    },
    navigationMenu: {
      slots: {
        link: "cursor-pointer"
      },
      variants: {
        disabled: {
          true: {
            link: "cursor-text"
          }
        }
      }
    }
  }
});
