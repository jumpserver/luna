import type { DesktopStore, DesktopUnlistenFn } from "~/shared/desktop/bridge";
import type { ThemePresetId } from "~/composables/useThemePresets";
import { desktopStore } from "~/shared/desktop/bridge";
import type { CodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import type {
  AppConfigType,
  CharsetType,
  LanguagePreference,
  ResolutionType,
  SidebarSectionVisibility,
  SortType
} from "~/types";

import { DEFAULT_SIDEBAR_SECTIONS, normalizeSidebarSections } from "~/composables/useSidebarSections";
import { DEFAULT_DARK_THEME_PRESET, DEFAULT_LIGHT_THEME_PRESET } from "~/composables/useThemePresets";

export type ThemeType = "light" | "dark" | "withSystem" | "";
export type LayoutsType = "grid" | "table";
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 420;
export const DEFAULT_SIDEBAR_WIDTH = 220;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 13;

export const normalizeSidebarWidth = (width: unknown) => {
  const value = typeof width === "number" && Number.isFinite(width) ? Math.round(width) : DEFAULT_SIDEBAR_WIDTH;

  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
};

export const normalizeFontSize = (size: unknown) => {
  const value = typeof size === "number" && Number.isFinite(size) ? Math.round(size) : DEFAULT_FONT_SIZE;

  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
};

export interface UserSettingPersistedState {
  language: LanguagePreference;
  collapse: boolean;
  sort: SortType;
  theme: ThemeType;
  themeMode: ThemeType;
  followSystem: boolean;
  layouts: LayoutsType;
  fontFamily: string;
  uiFontSize: number;
  codeFontSize: number;
  primaryColor: string;
  primaryColorLight: string;
  primaryColorDark: string;
  lightThemePreset: ThemePresetId;
  darkThemePreset: ThemePresetId;
  terminalThemePreset: string;
  codeMirrorThemePreset: CodeMirrorThemePresetId;
  appConfig: AppConfigType | null;
  charset: CharsetType;
  rdpResolution: ResolutionType;
  backspaceAsCtrlH: boolean;
  terminalCommandSuggestionsEnabled: boolean;
  keyboardLayout: string;
  rdpClientOption: string[];
  rdpColorQuality: string;
  rdpSmartSize: string;
  recentSites: string[];
  sidebarWidth: number;
  sidebarSections: SidebarSectionVisibility;
}

const STORE_PATH = "user-setting.json";
const STORE_KEY = "state";
const WEB_STORE_KEY = "jumpserver-client:user-setting";

export const DEFAULT_STATE: UserSettingPersistedState = {
  language: "system",
  collapse: false,
  sort: "name",
  theme: "" as ThemeType,
  themeMode: "" as ThemeType,
  followSystem: false,
  layouts: "grid",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  uiFontSize: DEFAULT_FONT_SIZE,
  codeFontSize: DEFAULT_FONT_SIZE,
  primaryColor: "#1ab394",
  primaryColorLight: "#1ab394",
  primaryColorDark: "#34d399",
  lightThemePreset: DEFAULT_LIGHT_THEME_PRESET,
  darkThemePreset: DEFAULT_DARK_THEME_PRESET,
  terminalThemePreset: "follow-app",
  codeMirrorThemePreset: "follow-app",
  appConfig: null,
  charset: "default",
  rdpResolution: "auto",
  backspaceAsCtrlH: false,
  terminalCommandSuggestionsEnabled: true,
  keyboardLayout: "en-us-qwerty",
  rdpClientOption: [],
  rdpColorQuality: "32",
  rdpSmartSize: "0",
  recentSites: [],
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarSections: DEFAULT_SIDEBAR_SECTIONS
};

let storeInstance: DesktopStore | null = null;
let storePromise: Promise<DesktopStore> | null = null;

const loadWebState = () => {
  if (!import.meta.client) return DEFAULT_STATE;

  try {
    const raw = globalThis.localStorage?.getItem(WEB_STORE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<UserSettingPersistedState>) };
    return {
      ...parsed,
      uiFontSize: normalizeFontSize(parsed.uiFontSize),
      codeFontSize: normalizeFontSize(parsed.codeFontSize),
      sidebarWidth: normalizeSidebarWidth(parsed.sidebarWidth),
      sidebarSections: normalizeSidebarSections(parsed.sidebarSections)
    };
  } catch {
    return DEFAULT_STATE;
  }
};

const saveWebState = (next: UserSettingPersistedState) => {
  if (!import.meta.client) return;

  globalThis.localStorage?.setItem(WEB_STORE_KEY, JSON.stringify(next));
  globalThis.dispatchEvent(new CustomEvent(WEB_STORE_KEY, { detail: next }));
};

async function ensureStore() {
  if (storeInstance) return storeInstance;

  if (!storePromise) {
    storePromise = desktopStore.load(STORE_PATH, { [STORE_KEY]: DEFAULT_STATE });
  }

  storeInstance = await storePromise;
  return storeInstance;
}

export const useSettingStorage = () => {
  const load = async (): Promise<UserSettingPersistedState> => {
    if (!isDesktopRuntime()) {
      return loadWebState();
    }

    const store = await ensureStore();
    const saved = (await store.get<UserSettingPersistedState>(STORE_KEY)) || DEFAULT_STATE;
    return {
      ...DEFAULT_STATE,
      ...saved,
      uiFontSize: normalizeFontSize(saved.uiFontSize),
      codeFontSize: normalizeFontSize(saved.codeFontSize),
      sidebarWidth: normalizeSidebarWidth(saved.sidebarWidth),
      sidebarSections: normalizeSidebarSections(saved.sidebarSections)
    };
  };

  const save = async (next: UserSettingPersistedState) => {
    if (!isDesktopRuntime()) {
      saveWebState(next);
      return;
    }

    const store = await ensureStore();
    await store.set(STORE_KEY, next);
    await store.save();
  };

  const patch = async (partial: Partial<UserSettingPersistedState>) => {
    const current = await load();
    const next = { ...current, ...partial };
    await save(next);
  };

  const reset = async () => {
    if (!isDesktopRuntime()) {
      saveWebState(DEFAULT_STATE);
      return;
    }

    const store = await ensureStore();
    await store.set(STORE_KEY, DEFAULT_STATE);
    await store.save();
  };

  const subscribe = async (cb: (state: UserSettingPersistedState) => void): Promise<DesktopUnlistenFn> => {
    if (!isDesktopRuntime()) {
      const handler = (event: Event) => {
        const next = { ...DEFAULT_STATE, ...((event as CustomEvent<UserSettingPersistedState>).detail || {}) };
        cb({
          ...next,
          uiFontSize: normalizeFontSize(next.uiFontSize),
          codeFontSize: normalizeFontSize(next.codeFontSize),
          sidebarWidth: normalizeSidebarWidth(next.sidebarWidth),
          sidebarSections: normalizeSidebarSections(next.sidebarSections)
        });
      };

      globalThis.addEventListener(WEB_STORE_KEY, handler);
      return () => globalThis.removeEventListener(WEB_STORE_KEY, handler);
    }

    const store = await ensureStore();
    return store.onChange((key, value) => {
      if (key === STORE_KEY && value) {
        const next = { ...DEFAULT_STATE, ...(value as UserSettingPersistedState) };
        cb({
          ...next,
          uiFontSize: normalizeFontSize(next.uiFontSize),
          codeFontSize: normalizeFontSize(next.codeFontSize),
          sidebarWidth: normalizeSidebarWidth(next.sidebarWidth),
          sidebarSections: normalizeSidebarSections(next.sidebarSections)
        });
      }
    });
  };

  return {
    load,
    save,
    patch,
    reset,
    subscribe,
    defaults: DEFAULT_STATE
  };
};
