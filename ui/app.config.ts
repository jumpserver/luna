export default defineAppConfig({
  app: {
    name: "JumpServer Client",
    author: "JumpServer",
    version: "4.0.0",
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
    fonts: false,
    colors: {
      primary: "primary",
      neutral: "zinc"
    },
    container: {
      base: "mx-0 w-full"
    },
    button: {
      slots: {
        base: "cursor-pointer rounded-[3px]"
      },
      variants: {
        ghost: {
          neutral: {
            base: "bg-transparent text-[var(--app-fg)] hover:bg-[var(--app-hover-soft)]"
          }
        }
      }
    },
    toast: {
      slots: {
        wrapper: "w-0 min-w-0 flex-1 flex flex-col",
        description: "text-sm text-muted whitespace-pre-wrap break-all",
        actions: "flex gap-1.5 shrink-0 flex-wrap"
      }
    },
    formField: {
      slots: {
        root: "w-full"
      }
    },
    input: {
      slots: {
        root: "w-full",
        base: "rounded-[3px] bg-[var(--app-input-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-muted)] ring-[var(--app-border)]"
      }
    },
    textarea: {
      slots: {
        root: "w-full",
        base: "resize-none rounded-[3px] bg-[var(--app-input-bg)] text-[var(--app-fg)] placeholder:text-[var(--app-muted)] ring-[var(--app-border)]"
      }
    },
    select: {
      slots: {
        base: "rounded-[3px]"
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
        content:
          "w-(--reka-dropdown-menu-trigger-width) p-1 bg-[var(--app-panel-bg)] text-[var(--app-fg)] ring-[var(--app-border)] shadow-[var(--theme-shadow-soft)] backdrop-blur-md",
        viewport: "relative overflow-y-auto flex-1",
        group: "p-1 isolate",
        label:
          "w-full flex items-center px-2 py-1 text-[11px] font-semibold text-[var(--app-muted)] uppercase tracking-[0.08em]",
        separator: "-mx-1 my-1 h-px bg-[var(--app-border)]",
        item: "mx-0.5 px-3 py-1.5 rounded-md text-sm leading-5 transition-colors duration-150 text-[var(--app-fg)] data-highlighted:bg-[var(--app-hover-soft)] data-[state=open]:bg-[var(--app-hover-soft)] data-highlighted:text-[var(--app-fg)] data-[state=open]:text-[var(--app-fg)]"
      }
    },
    modal: {
      slots: {
        overlay: "fixed inset-0 bg-black/22 backdrop-blur-[2px]",
        content:
          "bg-[var(--app-surface-panel-strong)] text-[var(--app-fg)] divide-y divide-[var(--app-border)] flex flex-col focus:outline-none ring-1 ring-[var(--app-border-strong)] shadow-[0_18px_60px_rgba(15,23,42,0.22),var(--theme-shadow-soft)] backdrop-blur-md",
        header: "flex items-center gap-1.5 px-4 py-2 sm:px-6 min-h-(--ui-header-height) bg-[var(--app-header-bg)]",
        body: "flex-1 p-4 sm:p-6 bg-[var(--app-surface-panel-strong)]",
        footer: "flex items-center gap-1.5 p-4 sm:px-6 bg-[var(--app-header-bg)]",
        title: "text-sm leading-5 text-[var(--app-fg)] font-semibold",
        description: "text-sm leading-5 text-[var(--app-muted)]",
        close: "absolute top-4 end-4 text-[var(--app-muted)] hover:text-[var(--app-fg)]"
      }
    },
    popover: {
      slots: {
        content:
          "bg-[var(--app-panel-bg)] text-[var(--app-fg)] shadow-[var(--theme-shadow-soft)] rounded-md ring ring-[var(--app-border)] data-[state=open]:animate-[scale-in_100ms_ease-out] data-[state=closed]:animate-[scale-out_100ms_ease-in] origin-(--reka-popover-content-transform-origin) focus:outline-none pointer-events-auto backdrop-blur-md",
        arrow: "fill-[var(--app-panel-bg)] stroke-[var(--app-border)]"
      }
    },
    selectMenu: {
      slots: {
        base: "rounded-[3px]",
        content:
          "bg-[var(--app-panel-bg)] text-[var(--app-fg)] ring-[var(--app-border)] shadow-[var(--theme-shadow-soft)] backdrop-blur-md",
        input: "border-b border-[var(--app-border)]",
        viewport: "relative scroll-py-1 overflow-y-auto flex-1",
        group: "p-1 isolate",
        label:
          "w-full flex items-center px-2 py-1 text-[11px] font-semibold text-[var(--app-muted)] uppercase tracking-[0.08em]",
        separator: "-mx-1 my-1 h-px bg-[var(--app-border)]",
        item: "mx-0.5 rounded-md px-3 py-2 text-sm text-[var(--app-fg)] transition-colors data-highlighted:bg-[var(--app-hover-soft)] data-[state=checked]:bg-[var(--app-selected-soft)]"
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
