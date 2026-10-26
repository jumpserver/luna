<script setup lang="ts">
import type { ShortcutId } from "~/shared/shortcuts";
import { desktopInvoke } from "~/shared/desktop/bridge";
import {
  conflictingShortcut,
  defaultShortcut,
  isReservedShortcut,
  shortcutDefinitions,
  shortcutFromEvent,
  shortcutLabel
} from "~/shared/shortcuts";

const { t } = useI18n();
const { shortcutOverrides, setShortcutOverrides, sessionDigitShortcuts, setSessionDigitShortcuts, isHydrated } =
  useSettingManager();
const { label, environment } = useAppShortcuts();
const search = ref("");
const recording = ref<ShortcutId | null>(null);
const recordingReady = ref(false);
const draft = ref<string | null>(null);
const error = ref("");
const resetAllOpen = ref(false);
const toast = useToast();
const definitions = computed(() =>
  shortcutDefinitions.filter(
    (definition) =>
      (!("desktopOnly" in definition) || environment.value.desktop) &&
      `${t(`Shortcuts.Actions.${definition.id}`)} ${label(definition.id)}`
        .toLocaleLowerCase()
        .includes(search.value.trim().toLocaleLowerCase())
  )
);

function validation(id: ShortcutId, binding: string) {
  if (isReservedShortcut(binding, id, environment.value)) return t("Shortcuts.Reserved");
  const conflict = conflictingShortcut(id, binding, shortcutOverrides.value, environment.value);
  return conflict ? t("Shortcuts.Conflict", { action: t(`Shortcuts.Actions.${conflict}`) }) : "";
}

async function startRecording(id: ShortcutId) {
  draft.value = null;
  error.value = "";
  recordingReady.value = false;
  recording.value = id;
  try {
    if (environment.value.desktop) await desktopInvoke("set_shortcut_recording", { enabled: true });
    recordingReady.value = Boolean(recording.value);
  } catch {
    error.value = t("Shortcuts.RecordingFailed");
  }
}

function stopRecording() {
  recording.value = null;
  recordingReady.value = false;
  if (environment.value.desktop) void desktopInvoke("set_shortcut_recording", { enabled: false });
}

useEventListener(
  window,
  "keydown",
  (event: KeyboardEvent) => {
    if (!recording.value) return;
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key === "Tab" ||
        (event.target instanceof Element && event.target.closest("button") && ["Enter", " "].includes(event.key)))
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      stopRecording();
      return;
    }
    if (!recordingReady.value || event.repeat || event.isComposing) return;
    if (["Control", "Meta", "Alt", "Shift", "AltGraph"].includes(event.key)) return;
    const binding = shortcutFromEvent(event, environment.value.mac);
    draft.value = binding;
    error.value = binding ? validation(recording.value, binding) : t("Shortcuts.ModifierRequired");
  },
  { capture: true }
);

useEventListener(
  window,
  "keyup",
  (event: KeyboardEvent) => {
    if (!recording.value) return;
    event.stopImmediatePropagation();
  },
  { capture: true }
);

function save() {
  if (!recording.value || !draft.value) return;
  error.value = validation(recording.value, draft.value);
  if (error.value) return;
  setShortcutOverrides({ ...shortcutOverrides.value, [recording.value]: draft.value });
  stopRecording();
}

function restore(id: ShortcutId) {
  const restored = { ...shortcutOverrides.value };
  delete restored[id];
  const defaults =
    id === "closeTab" && environment.value.desktop
      ? [defaultShortcut(id, environment.value), "Alt+Shift+KeyW"]
      : [defaultShortcut(id, environment.value)];
  const message = defaults.map((binding) => validation(id, binding)).find(Boolean);
  if (message) {
    toast.add({ title: message, color: "error" });
    return;
  }
  setShortcutOverrides(restored);
}

function resetAll() {
  setShortcutOverrides({});
  setSessionDigitShortcuts(true);
  resetAllOpen.value = false;
}

onBeforeUnmount(stopRecording);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UInput
        v-model="search"
        size="sm"
        icon="i-lucide-search"
        :placeholder="t('Shortcuts.Search')"
        :aria-label="t('Shortcuts.Search')"
        class="w-full sm:w-72"
      />
      <UButton
        :label="t('Shortcuts.ResetAll')"
        size="sm"
        icon="i-lucide-undo-2"
        color="neutral"
        variant="outline"
        :disabled="!isHydrated"
        @click="resetAllOpen = true"
      />
    </div>
    <p class="text-xs leading-5 text-muted">{{ t("Shortcuts.Hint") }}</p>
    <SettingsGroup>
      <SettingsRow
        v-for="definition in definitions"
        :key="definition.id"
        :title="t(`Shortcuts.Actions.${definition.id}`)"
        :description="t(`Shortcuts.Scopes.${definition.scope}`)"
      >
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UBadge
            v-if="'desktopOnly' in definition"
            :label="t('Shortcuts.DesktopOnly')"
            size="sm"
            color="neutral"
            variant="soft"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :label="label(definition.id) || t('Shortcuts.Disabled')"
            :aria-label="t('Shortcuts.Change', { action: t(`Shortcuts.Actions.${definition.id}`) })"
            :disabled="!isHydrated"
            @click="startRecording(definition.id)"
          />
          <UButton
            v-if="shortcutOverrides[definition.id] === undefined"
            size="sm"
            icon="i-lucide-ban"
            color="neutral"
            variant="ghost"
            :aria-label="t('Shortcuts.Disable', { action: t(`Shortcuts.Actions.${definition.id}`) })"
            :title="t('Shortcuts.Disable', { action: t(`Shortcuts.Actions.${definition.id}`) })"
            :disabled="!isHydrated"
            @click="setShortcutOverrides({ ...shortcutOverrides, [definition.id]: null })"
          />
          <UButton
            v-else
            size="sm"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            :aria-label="t('Shortcuts.Restore', { action: t(`Shortcuts.Actions.${definition.id}`) })"
            :title="t('Shortcuts.Restore', { action: t(`Shortcuts.Actions.${definition.id}`) })"
            :disabled="!isHydrated"
            @click="restore(definition.id)"
          />
        </div>
      </SettingsRow>
      <p v-if="!definitions.length" class="p-4 text-sm text-muted">{{ t("Shortcuts.NoResults") }}</p>
    </SettingsGroup>
    <SettingsGroup>
      <SettingsRow
        :title="t('Shortcuts.DigitTabs')"
        :description="t('Shortcuts.DigitTabsHint', { modifier: environment.mac ? '⌘' : 'Ctrl' })"
      >
        <USwitch
          :model-value="sessionDigitShortcuts"
          :aria-label="t('Shortcuts.DigitTabs')"
          :disabled="!isHydrated"
          @update:model-value="setSessionDigitShortcuts"
        />
      </SettingsRow>
    </SettingsGroup>
    <UModal
      :open="Boolean(recording)"
      :dismissible="false"
      :title="recording ? t('Shortcuts.Change', { action: t(`Shortcuts.Actions.${recording}`) }) : ''"
      :description="t('Shortcuts.RecordHint')"
      @update:open="
        (open) => {
          if (!open) stopRecording();
        }
      "
    >
      <template #body>
        <div data-shortcut-recorder tabindex="0" :aria-label="t('Shortcuts.RecordHint')" class="space-y-3">
          <div
            class="rounded-lg border border-(--app-border) bg-(--app-surface-input) p-6 text-center"
            :class="draft ? 'font-ui-mono text-lg' : 'text-sm text-muted'"
            aria-live="polite"
          >
            {{ draft ? shortcutLabel(draft, environment.mac) : t("Shortcuts.PressKeys") }}
          </div>
          <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Common.Cancel')" color="neutral" variant="ghost" @click="stopRecording" />
          <UButton :label="t('Common.Save')" :disabled="!draft || Boolean(error) || !recordingReady" @click="save" />
        </div>
      </template>
    </UModal>
    <UModal v-model:open="resetAllOpen" :title="t('Shortcuts.ResetAll')" :description="t('Shortcuts.ResetConfirm')">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Common.Cancel')" color="neutral" variant="ghost" @click="resetAllOpen = false" />
          <UButton :label="t('Shortcuts.ResetAll')" @click="resetAll" />
        </div>
      </template>
    </UModal>
  </div>
</template>
