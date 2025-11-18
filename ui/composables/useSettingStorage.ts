import type { UnlistenFn } from "@tauri-apps/api/event";
import { Store } from "@tauri-apps/plugin-store";

import type { AppConfigType, SortType, LangType, CharsetType, ResolutionType } from "~/types";

export type ThemeType = "light" | "dark" | "withSystem" | "";
export type LayoutsType = "grid" | "table";

export type UserSettingPersistedState = {
  language: LangType;
  siteLanguages: Record<string, LangType>;
  collapse: boolean;
  sort: SortType;
  theme: ThemeType;
  followSystem: boolean;
  layouts: LayoutsType;
  fontFamily: string;
  primaryColor: string;
  primaryColorLight: string;
  primaryColorDark: string;
  appConfig?: AppConfigType | null;
  charset: CharsetType;
  rdpResolution: ResolutionType;
  backspaceAsCtrlH: boolean;
  keyboardLayout: string;
  rdpClientOption: string[];
  rdpColorQuality: string;
  rdpSmartSize: string;
};

const STORE_PATH = "user-setting.json";
const STORE_KEY = "state";

const DEFAULT_STATE: UserSettingPersistedState = {
  language: "zh",
  siteLanguages: {},
  collapse: false,
  sort: "name",
  theme: "" as ThemeType,
  followSystem: false,
  layouts: "grid",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
  primaryColor: "#1ab394",
  primaryColorLight: "#1ab394",
  primaryColorDark: "#34d399",
  appConfig: null,
  charset: "default",
  rdpResolution: "auto",
  backspaceAsCtrlH: false,
  keyboardLayout: "en-us-qwerty",
  rdpClientOption: [],
  rdpColorQuality: "32",
  rdpSmartSize: "0"
};

let storeInstance: Store | null = null;
let storePromise: Promise<Store> | null = null;

async function ensureStore() {
  if (storeInstance) return storeInstance;

  if (!storePromise) {
    storePromise = Store.load(STORE_PATH, {
      defaults: { [STORE_KEY]: DEFAULT_STATE }
    });
  }

  storeInstance = await storePromise;
  return storeInstance;
}

export const useSettingStorage = () => {
  const load = async (): Promise<UserSettingPersistedState> => {
    const store = await ensureStore();
    const saved = (await store.get<UserSettingPersistedState>(STORE_KEY)) || DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...saved };
  };

  const save = async (next: UserSettingPersistedState) => {
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
    const store = await ensureStore();
    await store.set(STORE_KEY, DEFAULT_STATE);
    await store.save();
  };

  const subscribe = async (cb: (state: UserSettingPersistedState) => void): Promise<UnlistenFn> => {
    const store = await ensureStore();
    return store.onChange((key, value) => {
      if (key === STORE_KEY && value) {
        cb({ ...DEFAULT_STATE, ...(value as UserSettingPersistedState) });
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
