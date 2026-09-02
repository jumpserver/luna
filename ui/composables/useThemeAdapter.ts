import type { DesktopEvent, DesktopTheme } from "~/shared/desktop/bridge";
import { nextTick } from "vue";
import { desktopWindow } from "~/shared/desktop/bridge";

export type ThemeRevealOrigin = { x: number; y: number };

const THEME_REVEAL_MS = 480;
const THEME_REVEAL_STYLE_ID = "theme-reveal-clip";
let lastPointerOrigin: ThemeRevealOrigin | null = null;
let themeRevealActive = false;

const installRevealClip = (x: number, y: number, radius: number) => {
  let style = document.getElementById(THEME_REVEAL_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_REVEAL_STYLE_ID;
    document.head.appendChild(style);
  }

  const start = `circle(0px at ${x}px ${y}px)`;
  const end = `circle(${radius}px at ${x}px ${y}px)`;
  style.textContent = `::view-transition-new(root) {
  clip-path: ${start};
  animation: theme-reveal-circle ${THEME_REVEAL_MS}ms ease-in both;
}
@keyframes theme-reveal-circle {
  from { clip-path: ${start}; }
  to { clip-path: ${end}; }
}`;
};

const clearRevealClip = () => {
  document.getElementById(THEME_REVEAL_STYLE_ID)?.remove();
};

if (import.meta.client) {
  window.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerOrigin = { x: event.clientX, y: event.clientY };
    },
    true
  );
}

export const useThemeAdapter = () => {
  const currentOSTheme = ref<DesktopTheme>("light");

  const uiColorMode = useColorMode();
  const { applyPrimaryColor } = useColor();
  const {
    theme: userTheme,
    themeMode,
    followSystem,
    hydrationPromise,
    isHydrated,
    setTheme,
    setThemeMode,
    setFollowSystem,
    lightThemePreset,
    darkThemePreset,
    primaryColorLight,
    primaryColorDark,
    setLightThemePreset,
    setDarkThemePreset,
    setPrimaryColorLight,
    setPrimaryColorDark
  } = useSettingManager();

  const getSystemTheme = async (): Promise<DesktopTheme> => {
    if (!isDesktopRuntime()) {
      return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    }

    return (await desktopWindow.theme()) || "light";
  };

  const waitHydration = async () => {
    if (isHydrated.value) return;

    // 等待 useSettingManager 完成初始化
    if (!hydrationPromise.value) {
      await nextTick();
    }

    const promise = hydrationPromise.value;

    if (promise) {
      try {
        await promise;
      } catch (err) {
        console.error("wait hydration failed", err);
      }
    }
  };

  /**
   * @description 应用首次加载默认使用 OS Theme
   */
  const initialTheme = async () => {
    await waitHydration();

    const savedMode = (themeMode.value || "") as string;
    const modeIsWithSystem = savedMode === "withSystem";
    const modeIsManual = savedMode === "dark" || savedMode === "light";

    const follow = modeIsWithSystem ? true : modeIsManual ? false : followSystem.value;
    const savedTheme = (modeIsManual ? savedMode : userTheme.value) as DesktopTheme | "";

    const osTheme = await getSystemTheme();

    if (!osTheme) {
      if (savedTheme) {
        uiColorMode.preference = savedTheme;
      }
      return;
    }

    currentOSTheme.value = osTheme;

    if (follow) {
      if (themeMode.value !== "withSystem") {
        setThemeMode("withSystem");
      }
      if (!followSystem.value) {
        setFollowSystem(true);
      }
      uiColorMode.preference = osTheme;
      setTheme(osTheme);
      return;
    }

    if (followSystem.value) {
      setFollowSystem(false);
    }

    if (savedTheme) {
      uiColorMode.preference = savedTheme;
      return;
    }

    uiColorMode.preference = osTheme;
    setTheme(osTheme);
  };

  const resolvePreset = (theme: DesktopTheme, preset?: string) =>
    preset || (theme === "dark" ? darkThemePreset.value : lightThemePreset.value);

  const resolveAccent = (theme: DesktopTheme, accent?: string) =>
    accent || (theme === "dark" ? primaryColorDark.value : primaryColorLight.value);

  const isVisualThemeApplied = (theme: DesktopTheme, preset?: string) => {
    if (!import.meta.client) return false;
    const root = document.documentElement;
    const expectedPreset = resolvePreset(theme, preset);
    return root.classList.contains(theme) && (!expectedPreset || root.dataset.themePreset === expectedPreset);
  };

  const applyVisualTheme = (theme: DesktopTheme, preset?: string, accent?: string) => {
    uiColorMode.preference = theme;
    if (!import.meta.client) return;

    const root = document.documentElement;
    const nextPreset = resolvePreset(theme, preset);
    const nextAccent = resolveAccent(theme, accent);
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    if (nextPreset) root.dataset.themePreset = nextPreset;
    if (nextAccent) applyPrimaryColor(nextAccent);
  };

  const runThemeTransition = (apply: () => void, origin?: ThemeRevealOrigin | null) => {
    if (!import.meta.client || !isHydrated.value) {
      apply();
      return;
    }

    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      apply();
      return;
    }

    const startViewTransition = document.startViewTransition?.bind(document);
    if (!startViewTransition) {
      apply();
      return;
    }

    // desktopEmit broadcasts the selection back to this window while the first
    // transition is still capturing its old state. Applying that echo here
    // would make both snapshots use the new theme and reveal nothing.
    if (themeRevealActive) return;

    const x = origin?.x ?? lastPointerOrigin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? lastPointerOrigin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    installRevealClip(x, y, endRadius);
    themeRevealActive = true;
    const transition = startViewTransition(async () => {
      apply();
      await nextTick();
    });

    void transition.finished.finally(() => {
      themeRevealActive = false;
      clearRevealClip();
    });
  };

  const persistThemeSelection = (theme: DesktopTheme, preset?: string, accent?: string) => {
    if (preset) {
      if (theme === "dark") setDarkThemePreset(preset as any);
      else setLightThemePreset(preset as any);
    }
    if (accent) {
      if (theme === "dark") setPrimaryColorDark(accent);
      else setPrimaryColorLight(accent);
    }
  };

  const commitManualTheme = (theme: DesktopTheme, options?: { preset?: string; accent?: string }) => {
    applyVisualTheme(theme, options?.preset, options?.accent);
    setFollowSystem(false);
    setThemeMode(theme as any);
    persistThemeSelection(theme, options?.preset, options?.accent);
    setTheme(theme);
  };

  const manualSetTheme = (
    theme: DesktopTheme,
    options?: { preset?: string; accent?: string },
    origin?: ThemeRevealOrigin | null
  ) => {
    if (isVisualThemeApplied(theme, options?.preset)) {
      commitManualTheme(theme, options);
      return;
    }

    runThemeTransition(() => {
      commitManualTheme(theme, options);
    }, origin);
  };

  const enableFollowSystem = async (origin?: ThemeRevealOrigin | null) => {
    const osTheme = (await getSystemTheme()) || currentOSTheme.value;
    const alreadyFollowing = themeMode.value === "withSystem" || followSystem.value;

    if (alreadyFollowing && osTheme && isVisualThemeApplied(osTheme)) {
      setFollowSystem(true);
      setThemeMode("withSystem");
      return;
    }

    if (!osTheme) {
      setFollowSystem(true);
      setThemeMode("withSystem");
      return;
    }

    runThemeTransition(() => {
      setFollowSystem(true);
      setThemeMode("withSystem");
      currentOSTheme.value = osTheme;
      applyVisualTheme(osTheme);
      setTheme(osTheme);
    }, origin);
  };

  const applyThemePreference = (theme: DesktopTheme) => {
    if (isVisualThemeApplied(theme)) return;
    runThemeTransition(() => {
      applyVisualTheme(theme);
    });
  };

  const applySystemThemePreference = async () => {
    const osTheme = (await getSystemTheme()) || currentOSTheme.value;

    if (!osTheme) return;
    currentOSTheme.value = osTheme;
    if (isVisualThemeApplied(osTheme)) return;
    runThemeTransition(() => {
      applyVisualTheme(osTheme);
    });
  };

  const listenOSThemeChange = () => {
    if (!isDesktopRuntime()) {
      const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
      if (!media) return;

      media.addEventListener("change", (event) => {
        const nextTheme: DesktopTheme = event.matches ? "dark" : "light";
        currentOSTheme.value = nextTheme;

        if (themeMode.value === "withSystem" || followSystem.value) {
          runThemeTransition(() => {
            applyVisualTheme(nextTheme);
            setTheme(nextTheme);
          });
        }
      });
      return;
    }

    // 监听 OS 主题变化
    desktopWindow.onThemeChanged((event: DesktopEvent<DesktopTheme>) => {
      currentOSTheme.value = event.payload;

      if (themeMode.value === "withSystem" || followSystem.value) {
        runThemeTransition(() => {
          applyVisualTheme(event.payload);
          setTheme(event.payload);
        });
      }
    });
  };

  return {
    userTheme,
    themeMode,
    followSystem,

    initialTheme,
    manualSetTheme,
    enableFollowSystem,
    listenOSThemeChange,
    applyThemePreference,
    applySystemThemePreference
  };
};
