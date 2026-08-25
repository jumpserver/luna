import type { Store } from "@tauri-apps/plugin-store";

export type LocalAiProviderId = "openai" | "anthropic" | "xai" | "moonshot" | "deepseek";
export type LocalAiCliId = "codex" | "claude" | "grok" | "kimi" | "deepseek";

export type LocalAiActiveSource = { type: "provider"; id: LocalAiProviderId } | { type: "cli"; id: LocalAiCliId };

export interface LocalAiProviderDefinition {
  id: LocalAiProviderId;
  name: string;
  icon: string;
  defaultEndpoint: string;
  models: string[];
}

export interface LocalAiProviderConfig {
  endpoint: string;
  model: string;
}

export interface LocalAiPersistedSettings {
  selectedProvider: LocalAiProviderId;
  activeSource: LocalAiActiveSource | null;
  providers: Record<LocalAiProviderId, LocalAiProviderConfig>;
}

export const LOCAL_AI_PROVIDER_DEFINITIONS: LocalAiProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "i-lucide-bot",
    defaultEndpoint: "https://api.openai.com/v1",
    models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "i-lucide-brain-circuit",
    defaultEndpoint: "https://api.anthropic.com",
    models: ["claude-opus-4.6", "claude-sonnet-4.6", "claude-haiku-4.5"]
  },
  {
    id: "xai",
    name: "xAI",
    icon: "i-lucide-orbit",
    defaultEndpoint: "https://api.x.ai/v1",
    models: ["grok-4", "grok-4-fast"]
  },
  {
    id: "moonshot",
    name: "Moonshot",
    icon: "i-lucide-moon",
    defaultEndpoint: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.5", "kimi-k2-thinking"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "i-lucide-waves",
    defaultEndpoint: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"]
  }
];

const STORE_PATH = "local-ai-settings.json";
const STORE_KEY = "settings";
const LOCAL_AI_CLI_IDS: LocalAiCliId[] = ["codex", "claude", "grok", "kimi", "deepseek"];

const createDefaults = (): LocalAiPersistedSettings => ({
  selectedProvider: "openai",
  activeSource: null,
  providers: Object.fromEntries(
    LOCAL_AI_PROVIDER_DEFINITIONS.map((provider) => [
      provider.id,
      {
        endpoint: provider.defaultEndpoint,
        model: provider.models[0] || ""
      }
    ])
  ) as Record<LocalAiProviderId, LocalAiProviderConfig>
});

const normalizeSettings = (
  value?: (Partial<LocalAiPersistedSettings> & { enabledProvider?: LocalAiProviderId | null }) | null
): LocalAiPersistedSettings => {
  const defaults = createDefaults();
  const selectedProvider = LOCAL_AI_PROVIDER_DEFINITIONS.some((provider) => provider.id === value?.selectedProvider)
    ? value!.selectedProvider!
    : defaults.selectedProvider;
  let activeSource: LocalAiActiveSource | null = null;
  if (
    value?.activeSource?.type === "provider" &&
    LOCAL_AI_PROVIDER_DEFINITIONS.some((provider) => provider.id === value.activeSource?.id)
  ) {
    activeSource = value.activeSource as LocalAiActiveSource;
  } else if (value?.activeSource?.type === "cli" && LOCAL_AI_CLI_IDS.includes(value.activeSource.id as LocalAiCliId)) {
    activeSource = value.activeSource as LocalAiActiveSource;
  } else if (LOCAL_AI_PROVIDER_DEFINITIONS.some((provider) => provider.id === value?.enabledProvider)) {
    activeSource = { type: "provider", id: value!.enabledProvider! };
  }

  return {
    selectedProvider,
    activeSource,
    providers: Object.fromEntries(
      LOCAL_AI_PROVIDER_DEFINITIONS.map((provider) => {
        const saved = value?.providers?.[provider.id];
        return [
          provider.id,
          {
            endpoint: saved?.endpoint?.trim() || provider.defaultEndpoint,
            model: saved?.model?.trim() || provider.models[0] || ""
          }
        ];
      })
    ) as Record<LocalAiProviderId, LocalAiProviderConfig>
  };
};

let storePromise: Promise<Store> | null = null;

const ensureStore = async () => {
  if (!storePromise) {
    const { Store } = await import("@tauri-apps/plugin-store");
    storePromise = Store.load(STORE_PATH, { defaults: { [STORE_KEY]: createDefaults() } });
  }
  return storePromise;
};

export const useLocalAiSettings = () => {
  const settings = useState<LocalAiPersistedSettings>("local-ai-settings", createDefaults);
  const loaded = useState("local-ai-settings-loaded", () => false);

  const load = async () => {
    if (!isTauriRuntime()) return false;

    const store = await ensureStore();
    settings.value = normalizeSettings(await store.get<LocalAiPersistedSettings>(STORE_KEY));
    loaded.value = true;
    return true;
  };

  const saveProvider = async (providerId: LocalAiProviderId, config: LocalAiProviderConfig) => {
    if (!isTauriRuntime()) throw new Error("Local AI settings are only available in the desktop client");

    settings.value = normalizeSettings({
      ...settings.value,
      selectedProvider: providerId,
      providers: {
        ...settings.value.providers,
        [providerId]: {
          endpoint: config.endpoint.trim(),
          model: config.model.trim()
        }
      }
    });

    const store = await ensureStore();
    await store.set(STORE_KEY, settings.value);
    await store.save();
  };

  const setActiveSource = async (activeSource: LocalAiActiveSource | null) => {
    if (!isTauriRuntime()) throw new Error("Local AI settings are only available in the desktop client");

    settings.value = normalizeSettings({
      ...settings.value,
      activeSource
    });

    const store = await ensureStore();
    await store.set(STORE_KEY, settings.value);
    await store.save();
  };

  const hasProviderApiKey = async (providerId: LocalAiProviderId) => {
    if (!isTauriRuntime()) return false;
    return await useTauriCoreInvoke<boolean>("has_local_ai_provider_api_key", { providerId });
  };

  const saveProviderApiKey = async (providerId: LocalAiProviderId, apiKey: string | null) => {
    if (!isTauriRuntime()) throw new Error("Local AI settings are only available in the desktop client");
    await useTauriCoreInvoke("set_local_ai_provider_api_key", { providerId, apiKey });
  };

  return {
    settings,
    loaded,
    load,
    saveProvider,
    hasProviderApiKey,
    saveProviderApiKey,
    setActiveSource
  };
};
