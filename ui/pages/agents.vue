<script setup lang="ts">
import type { AgentEngine, AgentEvent, AgentProfile } from "~/shared/agents/types";
import { commandReviewUrl, renderAiMarkdown } from "~/components/RightPanel/ai/presentation";
import { localAgentMessages } from "~/shared/agents/messages";
import { desktopInvoke, desktopListen, desktopOpener } from "~/shared/desktop/bridge";
import { resolveLanguageFromSystem } from "~/utils";

definePageMeta({ layout: false });

const { t } = useI18n({ useScope: "local", messages: localAgentMessages, fallbackLocale: "en" });
const { setLocale } = useI18n({ useScope: "global" });
const agents = useLocalAgents();
const { enabled, loaded, error, site, profiles, sessions } = agents;
const { isMacOS } = usePlatform();
const { language, isHydrated, lightThemePreset, darkThemePreset, primaryColorLight, primaryColorDark } =
  useSettingManager();
const { initialTheme, applyThemePreference, themeMode, followSystem } = useThemeAdapter();
watch(
  [isHydrated, language],
  async ([ready, preference], _previous, onCleanup) => {
    if (!ready) return;
    let stale = false;
    onCleanup(() => {
      stale = true;
    });
    const locale = preference === "system" ? await resolveLanguageFromSystem() : preference;
    if (!stale) await setLocale(locale);
  },
  { immediate: true }
);
watch(
  [isHydrated, themeMode, lightThemePreset, darkThemePreset, primaryColorLight, primaryColorDark],
  () => {
    if (isHydrated.value) void initialTheme();
  },
  { immediate: true }
);
let disposed = false;
let unlistenTheme: (() => void) | undefined;
onMounted(async () => {
  if (!agents.desktop) return;
  const stop = await desktopListen<"light" | "dark">("desktop://theme-changed", ({ payload }) => {
    if (!disposed && (themeMode.value === "withSystem" || followSystem.value)) applyThemePreference(payload);
  }).catch(() => undefined);
  if (disposed) stop?.();
  else unlistenTheme = stop;
});
onBeforeUnmount(() => {
  disposed = true;
  unlistenTheme?.();
});
const view = ref<"conversation" | "new" | "profiles">("new");
const selectedId = ref("");
const active = computed(() => sessions.value.find((session) => session.id === selectedId.value));
const drafts = reactive<Record<string, string>>({});
const draft = computed({
  get: () => drafts[selectedId.value] || "",
  set: (value: string) => {
    drafts[selectedId.value] = value;
  }
});
const busy = ref(false);
const sending = ref<string[]>([]);
const actionError = ref("");
const version = ref("");
const saved = ref(false);
const approving = ref<string[]>([]);
const deleteProfileOpen = ref(false);
const closeSessionOpen = ref(false);
const engineNames: Record<AgentEngine, string> = { codex: "Codex", claude: "Claude Code", pi: "Pi" };
const engines = Object.entries(engineNames).map(([value, label]) => ({ value, label }));
const freshProfile = (engine: AgentEngine = "codex"): AgentProfile => ({
  id: "",
  name: engineNames[engine],
  engine,
  executable: engine,
  model: "",
  cwd: ""
});
const profile = ref<AgentProfile>(freshProfile());
const profileOptions = computed(() => profiles.value.map(({ id, name }) => ({ label: name, value: id })));
const isRunning = computed(() => active.value?.status === "running" || active.value?.status === "starting");
const messages = useTemplateRef<HTMLElement>("messages");

watch(
  loaded,
  (ready) => {
    if (!ready) return;
    if (!profiles.value.length) view.value = "profiles";
    else if (sessions.value[0]) selectSession(sessions.value[0].id);
  },
  { immediate: true }
);
watch(site, (_site, previousSite) => {
  if (!previousSite) return;
  selectedId.value = "";
  for (const id of Object.keys(drafts)) delete drafts[id];
  view.value = profiles.value.length ? "new" : "profiles";
});
watch(
  () => active.value?.events,
  async () => {
    const element = messages.value;
    const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    await nextTick();
    if (nearBottom && messages.value) messages.value.scrollTop = messages.value.scrollHeight;
  }
);
watch(
  profile,
  () => {
    version.value = "";
    saved.value = false;
  },
  { deep: true }
);

function selectSession(id: string) {
  selectedId.value = id;
  view.value = "conversation";
  actionError.value = "";
}
function editProfile(id?: string) {
  profile.value = { ...(profiles.value.find((item) => item.id === id) || freshProfile()) };
  view.value = "profiles";
  actionError.value = "";
}
function selectEngine(engine: AgentEngine) {
  const previous = profile.value.engine;
  if (profile.value.executable === previous) profile.value.executable = engine;
  if (profile.value.name === engineNames[previous]) profile.value.name = engineNames[engine];
  profile.value.engine = engine;
}
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    await action();
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
function start(profileId: string) {
  void run(async () => {
    const session = await agents.create(profileId);
    selectSession(session.id);
  });
}
function send() {
  const sessionId = selectedId.value;
  const text = draft.value.trim();
  if (!text || active.value?.status !== "idle" || sending.value.includes(sessionId)) return;
  sending.value.push(sessionId);
  actionError.value = "";
  void agents
    .send(sessionId, text)
    .then(() => {
      if (drafts[sessionId]?.trim() === text) drafts[sessionId] = "";
    })
    .catch((cause) => {
      actionError.value = cause instanceof Error ? cause.message : String(cause);
    })
    .finally(() => {
      sending.value = sending.value.filter((id) => id !== sessionId);
    });
}
function hideWindow() {
  void desktopInvoke("close_window").catch((cause) => {
    actionError.value = cause instanceof Error ? cause.message : String(cause);
  });
}
function composerKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}
function openMessageLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  event.preventDefault();
  const url = commandReviewUrl(anchor.getAttribute("href"));
  if (url) void run(() => desktopOpener.openUrl(url));
}
function approve(event: AgentEvent, allow: boolean) {
  const requestId = event.requestId;
  const sessionId = selectedId.value;
  if (!requestId || approving.value.includes(requestId)) return;
  approving.value.push(requestId);
  actionError.value = "";
  void agents
    .approve(sessionId, requestId, allow)
    .catch((cause) => {
      actionError.value = cause instanceof Error ? cause.message : String(cause);
    })
    .finally(() => {
      approving.value = approving.value.filter((id) => id !== requestId);
    });
}
function saveProfile() {
  if (!profile.value.name.trim() || !profile.value.executable.trim()) {
    actionError.value = t("LocalAgents.Required");
    return;
  }
  void run(async () => {
    const value = { ...profile.value, id: profile.value.id || crypto.randomUUID() };
    await agents.saveProfile(value);
    profile.value = value;
    await nextTick();
    saved.value = true;
  });
}
function deleteProfile() {
  void run(async () => {
    await agents.deleteProfile(profile.value.id);
    deleteProfileOpen.value = false;
    editProfile(profiles.value[0]?.id);
  });
}
function closeSession() {
  const id = selectedId.value;
  void run(async () => {
    await agents.closeSession(id);
    delete drafts[id];
    closeSessionOpen.value = false;
    selectedId.value = "";
    if (sessions.value[0]) selectSession(sessions.value[0].id);
    else view.value = "new";
  });
}
</script>

<template>
  <div class="agents-window flex h-dvh min-w-0 flex-col overflow-hidden bg-(--app-surface-canvas) text-(--app-fg)">
    <header
      data-desktop-drag-region
      class="flex h-11 shrink-0 items-center gap-2 border-b border-(--app-border) px-3"
      :class="isMacOS ? 'pl-[88px]' : ''"
    >
      <UIcon name="i-lucide-bot" class="size-4 shrink-0" />
      <h1 class="min-w-0 flex-1 truncate text-sm font-medium">{{ t("LocalAgents.Title") }}</h1>
      <UButton
        v-if="agents.desktop"
        data-desktop-drag-region="false"
        icon="i-lucide-minus"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('LocalAgents.Hide')"
        :title="t('LocalAgents.Hide')"
        @click="hideWindow"
      />
    </header>
    <div
      v-if="!loaded || !enabled"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-(--app-muted)"
    >
      <p>{{ !loaded ? t("LocalAgents.Loading") : t("LocalAgents.Unavailable") }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <UButton
        v-if="agents.desktop && loaded"
        color="neutral"
        variant="outline"
        :label="t('LocalAgents.Retry')"
        @click="agents.refresh"
      />
    </div>
    <div v-else class="flex min-h-0 flex-1 max-sm:flex-col">
      <aside
        class="flex w-52 shrink-0 flex-col gap-3 border-r border-(--app-border) bg-(--app-surface-sidebar) p-3 max-sm:max-h-44 max-sm:w-full max-sm:border-r-0 max-sm:border-b"
      >
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          :label="t('LocalAgents.New')"
          :disabled="busy"
          @click="view = profiles.length ? 'new' : 'profiles'"
        />
        <nav :aria-label="t('LocalAgents.History')" class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <UButton
            v-for="session in sessions"
            :key="session.id"
            color="neutral"
            variant="ghost"
            class="w-full justify-start"
            :class="selectedId === session.id && view === 'conversation' ? 'bg-(--app-state-selected)' : ''"
            :aria-current="selectedId === session.id && view === 'conversation' ? 'page' : undefined"
            @click="selectSession(session.id)"
          >
            <span class="min-w-0 text-left">
              <span class="block truncate">{{ session.title || session.profileName }}</span>
              <span class="block truncate text-xs text-(--app-muted)">
                {{ session.profileName }} · {{ t(`LocalAgents.${session.status}`) }}
              </span>
            </span>
          </UButton>
        </nav>
        <UButton
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          :label="t('LocalAgents.Manage')"
          @click="editProfile(profiles[0]?.id)"
        />
      </aside>
      <main class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--app-border) px-4 py-2 text-xs text-(--app-muted)"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-bot" class="size-3.5" />
            {{ t("LocalAgents.Runtime") }}
          </span>
          <span class="min-w-0 truncate" :title="site">{{ site }}</span>
        </div>
        <UAlert
          v-if="actionError || error"
          color="error"
          variant="soft"
          :description="actionError || error"
          class="m-3 w-auto shrink-0"
        />

        <section v-if="view === 'profiles'" class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div class="mx-auto max-w-xl space-y-4">
            <h2 class="text-base font-semibold">{{ t("LocalAgents.Manage") }}</h2>
            <p class="text-sm text-(--app-muted)">{{ t("LocalAgents.AuthHint") }}</p>
            <div class="flex gap-2">
              <USelect
                :model-value="profile.id || undefined"
                :items="profileOptions"
                :placeholder="t('LocalAgents.Profile')"
                :aria-label="t('LocalAgents.Profile')"
                class="min-w-0 flex-1"
                @update:model-value="editProfile($event)"
              />
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :label="t('LocalAgents.AddProfile')"
                :disabled="busy"
                @click="editProfile()"
              />
            </div>
            <form class="space-y-4" @submit.prevent="saveProfile">
              <UFormField :label="t('LocalAgents.Name')" required>
                <UInput v-model="profile.name" :disabled="busy" />
              </UFormField>
              <UFormField :label="t('LocalAgents.Engine')">
                <USelect
                  :model-value="profile.engine"
                  :items="engines"
                  class="w-full"
                  :disabled="busy"
                  @update:model-value="selectEngine($event as AgentEngine)"
                />
              </UFormField>
              <UFormField :label="t('LocalAgents.Executable')" :help="t('LocalAgents.ExecutableHint')" required>
                <UInput v-model="profile.executable" :disabled="busy" :spellcheck="false" />
              </UFormField>
              <UFormField :label="t('LocalAgents.Cwd')" :help="t('LocalAgents.CwdHint')">
                <UInput v-model="profile.cwd" :disabled="busy" :spellcheck="false" />
              </UFormField>
              <UFormField :label="t('LocalAgents.Model')" :help="t('LocalAgents.ModelHint')">
                <UInput v-model="profile.model" :disabled="busy" :spellcheck="false" />
              </UFormField>
              <div class="flex flex-wrap gap-2">
                <UButton type="submit" :label="t('LocalAgents.Save')" :loading="busy" />
                <UButton
                  color="neutral"
                  variant="outline"
                  :label="t('LocalAgents.Probe')"
                  :disabled="busy || !profile.executable.trim()"
                  @click="
                    run(async () => {
                      version = (await agents.probe({ ...profile })).version;
                    })
                  "
                />
                <UButton
                  v-if="profile.id"
                  color="error"
                  variant="ghost"
                  :label="t('LocalAgents.Delete')"
                  :disabled="busy"
                  @click="deleteProfileOpen = true"
                />
              </div>
              <p v-if="version || saved" role="status" class="text-sm text-(--app-muted)">
                {{ version ? t("LocalAgents.Version", { version }) : t("LocalAgents.Saved") }}
              </p>
            </form>
          </div>
        </section>

        <section
          v-else-if="view === 'new' || !active"
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6"
        >
          <h2 class="text-base font-semibold">{{ t("LocalAgents.New") }}</h2>
          <p class="text-sm text-(--app-muted)">{{ t("LocalAgents.NewHint") }}</p>
          <div class="flex w-full max-w-md flex-col gap-2">
            <UButton
              v-for="item in profiles"
              :key="item.id"
              color="neutral"
              variant="outline"
              size="lg"
              :disabled="busy"
              @click="start(item.id)"
            >
              <UIcon name="i-lucide-bot" class="size-4" />
              <span class="min-w-0 flex-1 truncate text-left">{{ item.name }}</span>
              <span class="text-xs text-(--app-muted)">{{ engineNames[item.engine] }}</span>
            </UButton>
            <UButton v-if="!profiles.length" :label="t('LocalAgents.AddProfile')" @click="editProfile()" />
          </div>
          <p class="text-xs text-(--app-muted)">{{ t("LocalAgents.FixedAgent") }}</p>
        </section>

        <template v-else>
          <div class="flex shrink-0 items-center gap-2 border-b border-(--app-border) px-4 py-3">
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ active.profileName }}</span>
            <UBadge color="neutral" variant="subtle">{{ engineNames[active.engine] }}</UBadge>
            <span class="text-xs text-(--app-muted)">{{ t(`LocalAgents.${active.status}`) }}</span>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('LocalAgents.CloseSession')"
              :title="t('LocalAgents.CloseSession')"
              @click="closeSessionOpen = true"
            />
          </div>
          <div
            ref="messages"
            class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
            role="log"
            :aria-label="t('LocalAgents.History')"
            aria-live="polite"
          >
            <p v-if="!active.events.length" class="py-8 text-center text-sm text-(--app-muted)">
              {{ t("LocalAgents.NoMessages", { agent: active.profileName }) }}
            </p>
            <div v-for="event in active.events" :key="event.id" class="min-w-0 text-sm">
              <p
                v-if="event.type === 'text' && event.role === 'user'"
                class="ml-8 whitespace-pre-wrap break-words rounded border border-(--app-border) bg-(--app-surface-card) p-3"
              >
                {{ event.text }}
              </p>
              <div
                v-else-if="event.type === 'text'"
                class="agent-markdown"
                @click="openMessageLink"
                v-html="renderAiMarkdown(event.text)"
              />
              <details
                v-else-if="event.type === 'tool'"
                class="rounded border border-(--app-border) bg-(--app-surface-panel) p-3"
              >
                <summary class="cursor-pointer text-xs text-(--app-muted)">{{ t("LocalAgents.Tool") }}</summary>
                <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{{
                  event.text
                }}</pre>
              </details>
              <div
                v-else-if="event.type === 'approval'"
                class="space-y-3 rounded border border-(--app-border) bg-(--app-surface-panel) p-3"
              >
                <p class="font-medium">{{ t("LocalAgents.Approval") }}</p>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{{
                  event.text
                }}</pre>
                <div
                  v-if="event.requestId && (!event.status || ['pending', 'responding'].includes(event.status))"
                  class="flex gap-2"
                >
                  <UButton
                    size="sm"
                    :label="t('LocalAgents.Approve')"
                    :disabled="event.status === 'responding' || approving.includes(event.requestId)"
                    @click="approve(event, true)"
                  />
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    :label="t('LocalAgents.Deny')"
                    :disabled="event.status === 'responding' || approving.includes(event.requestId)"
                    @click="approve(event, false)"
                  />
                </div>
                <p v-else-if="event.status" class="text-xs text-(--app-muted)">
                  {{ t(`LocalAgents.${event.status}`) }}
                </p>
              </div>
              <UAlert v-else-if="event.type === 'error'" color="error" variant="soft" :description="event.text" />
              <p v-else class="whitespace-pre-wrap break-words text-xs text-(--app-muted)">{{ event.text }}</p>
            </div>
          </div>
          <form class="shrink-0 space-y-2 border-t border-(--app-border) p-3" @submit.prevent="send">
            <UTextarea
              v-model="draft"
              :rows="3"
              :placeholder="t('LocalAgents.Message')"
              :aria-label="t('LocalAgents.Message')"
              autoresize
              :maxrows="7"
              @keydown="composerKeydown"
            />
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-(--app-muted)">{{ t("LocalAgents.Separate") }}</p>
              <UButton
                v-if="isRunning"
                color="neutral"
                variant="outline"
                icon="i-lucide-square"
                :label="t('LocalAgents.Stop')"
                :disabled="busy"
                @click="run(() => agents.stop(selectedId))"
              />
              <UButton
                v-else
                type="submit"
                icon="i-lucide-arrow-up"
                :label="t('LocalAgents.Send')"
                :disabled="busy || active.status !== 'idle' || sending.includes(selectedId) || !draft.trim()"
              />
            </div>
          </form>
        </template>
        <p class="shrink-0 border-t border-(--app-border) px-4 py-2 text-xs text-(--app-muted)">
          {{ t("LocalAgents.Ephemeral") }}
        </p>
      </main>
    </div>
    <UModal
      v-model:open="deleteProfileOpen"
      :title="t('LocalAgents.DeleteProfile')"
      :description="t('LocalAgents.DeleteHint')"
    >
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('LocalAgents.Cancel')"
          @click="deleteProfileOpen = false"
        />
        <UButton color="error" :label="t('LocalAgents.Delete')" :loading="busy" @click="deleteProfile" />
      </template>
    </UModal>
    <UModal
      v-model:open="closeSessionOpen"
      :title="t('LocalAgents.CloseSession')"
      :description="t('LocalAgents.CloseConfirm')"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" :label="t('LocalAgents.Cancel')" @click="closeSessionOpen = false" />
        <UButton color="error" :label="t('LocalAgents.CloseSession')" :loading="busy" @click="closeSession" />
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.agent-markdown {
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.agent-markdown :deep(p + p),
.agent-markdown :deep(pre),
.agent-markdown :deep(ul),
.agent-markdown :deep(ol) {
  margin-top: 0.65rem;
}
.agent-markdown :deep(pre) {
  max-width: 100%;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface-panel);
  font-size: 0.8rem;
}
.agent-markdown :deep(code) {
  font-family: var(--font-mono);
}
.agent-markdown :deep(ul) {
  list-style: disc;
  padding-left: 1.5rem;
}
.agent-markdown :deep(ol) {
  list-style: decimal;
  padding-left: 1.5rem;
}
.agent-markdown :deep(a) {
  color: var(--theme-accent);
  text-decoration: underline;
}
.agent-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}
.agent-markdown :deep(th),
.agent-markdown :deep(td) {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--app-border);
}
</style>
