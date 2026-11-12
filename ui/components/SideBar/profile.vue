<script setup lang="ts">
import type { LoginSitePrefill } from "~/composables/useEventBus";
import type { LangType, ThemePresetId } from "~/types/index";

import { useSettingManager } from "~/composables/useSettingManager";
import { confirmLeaveCurrentSiteSessions } from "~/composables/useSiteAccountSwitch";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";
import { desktopEmit, desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { addErrorToast } = useErrorToast();
const localePath = useLocalePath();
const userInfoStore = useUserInfoStore();

const { t, locales, locale } = useI18n();
const { lock: lockWebSession, state: webLockState } = useWebSessionLock();
const shortcuts = useAppShortcuts();
const { loggedIn, currentAccountId, userMap, currentUser } = storeToRefs(userInfoStore);
const { openSettings } = useSettingsWindow();
const {
  currentAppearanceMode,
  applyAppearanceMode,
  currentThemePresetId,
  currentThemePresetLabel,
  selectThemePreset,
  themePresetLabel
} = useThemeOptions();

const {
  primaryColorLight,
  primaryColorDark,
  setLang,
  setLightThemePreset,
  setDarkThemePreset,
  setPrimaryColorLight,
  setPrimaryColorDark
} = useSettingManager();
const { userTheme, isThemeRevealActive } = useThemeAdapter();
const { applyPrimaryColor } = useColor();

const profileOpen = ref(false);
const profileOpenedByPointer = ref(false);
const downloadCenterUrl = computed(() =>
  import.meta.client ? withWebSitePrefix("/core/download/") : "/core/download/"
);
const headerIconButtonClass =
  "grid size-6 shrink-0 place-items-center rounded-[length:var(--app-radius)] p-0 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]";
const headerIconButtonActiveClass = "bg-[var(--app-hover-soft)] text-[var(--app-fg)]";

const desktopLogin = useDesktopLogin();
const { addingSite } = desktopLogin;
useEventBus().on("login", (request) => openLoginPage(request?.accountId, request?.prefill));

const accountTooltip = computed(() => {
  if (!loggedIn.value) return t("Common.More");
  if (loggedIn.value && currentUser.value?.name) return currentUser.value.name;
  return t("Common.Account");
});

const accountSite = computed(() => {
  const site = currentUser.value?.site || "—";
  const name = currentUser.value?.siteName;
  return name && name !== site ? `${site} · ${name}` : site;
});

const languageItems = computed(() =>
  ((locales.value as Array<{ code?: string; name?: string } | string>) || []).map((item) => {
    const id = typeof item === "string" ? item : item.code || "";
    const label = typeof item === "string" ? item : item.name || id;
    return { id, label };
  })
);

const currentLanguageLabel = computed(
  () => languageItems.value.find((item) => item.id === locale.value)?.label || locale.value
);
const primaryLanguageItems = computed(() => languageItems.value.filter((item) => item.id === "en" || item.id === "zh"));
const extraLanguageItems = computed(() => languageItems.value.filter((item) => item.id !== "zh" && item.id !== "en"));
const extraLanguageLabel = computed(
  () => extraLanguageItems.value.find((item) => item.id === locale.value)?.label || ""
);
const selectedPrimaryLanguage = computed({
  get: () => locale.value,
  set: (id: string) => setLang(id as LangType)
});
const moreLanguagesOpen = ref(false);
const selectExtraLanguage = (id: string) => {
  setLang(id as LangType);
  moreLanguagesOpen.value = false;
};

const appearanceModes = computed(() => [
  { id: "withSystem" as const, label: t("Common.System") },
  { id: "light" as const, label: t("Common.Light") },
  { id: "dark" as const, label: t("Common.Dark") }
]);

const themeRevealOrigin = ref<{ x: number; y: number } | null>(null);

const selectedAppearanceMode = computed({
  get: () => currentAppearanceMode.value,
  set: (mode: "withSystem" | "light" | "dark") => {
    void applyAppearanceMode(mode, themeRevealOrigin.value);
  }
});

const onThemePointerDown = (event: PointerEvent) => {
  themeRevealOrigin.value = { x: event.clientX, y: event.clientY };
};

const currentAppearanceLabel = computed(
  () => appearanceModes.value.find((item) => item.id === currentAppearanceMode.value)?.label || ""
);

const menuTabsUi = {
  root: "w-full",
  list: "w-full rounded-[length:var(--app-radius)] bg-[var(--app-surface-panel)] p-1 ring-1 ring-[var(--app-border)]",
  indicator: "rounded-[length:var(--app-radius)] bg-[var(--app-state-hover-strong)] shadow-none",
  trigger:
    "flex-1 rounded-[length:var(--app-radius)] px-3 data-[state=inactive]:text-[var(--app-text-secondary)] data-[state=active]:text-highlighted focus-visible:outline-[var(--app-focus-ring)]"
};

const menuSeparatorUi = {
  border: "border-t border-[var(--app-border-soft)]"
};

const menuShortcutButtonUi = {
  label: "min-w-0 flex-1 truncate text-left"
};

const currentThemeAccent = computed(() => {
  const preset = getThemePreset(currentThemePresetId.value);
  return preset?.baseColor || preset?.accent || "var(--theme-accent)";
});
const themePaletteOpen = ref(false);
const previewedThemePresetId = ref<ThemePresetId | null>(null);
const palettePreviewArmed = ref(false);
const PALETTE_PREVIEW_DELAY_MS = 300;
let palettePreviewArmFrame = 0;
let palettePreviewTimer: ReturnType<typeof setTimeout> | null = null;

const resolvedPaletteMode = computed<"light" | "dark">(() => {
  if (currentAppearanceMode.value === "light") return "light";
  if (currentAppearanceMode.value === "dark") return "dark";
  return userTheme.value === "dark" ? "dark" : "light";
});

const visibleThemePresets = computed(() =>
  resolvedPaletteMode.value === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS
);

const handleProfileOpenAutoFocus = (event: Event) => {
  if (profileOpenedByPointer.value) event.preventDefault();
  profileOpenedByPointer.value = false;
};

const handlePaletteOpenAutoFocus = (event: Event) => {
  event.preventDefault();
};

const handleProfileInteractOutside = (event: Event) => {
  const nested = event
    .composedPath()
    .some((node) => node instanceof Element && node.hasAttribute("data-profile-nested-popover"));
  if (nested || isThemeRevealActive()) event.preventDefault();
};

const handlePaletteInteractOutside = (event: Event) => {
  if (isThemeRevealActive()) event.preventDefault();
};

const cancelPalettePreviewArm = () => {
  if (!palettePreviewArmFrame) return;
  cancelAnimationFrame(palettePreviewArmFrame);
  palettePreviewArmFrame = 0;
};

const cancelPalettePreviewTimer = () => {
  if (!palettePreviewTimer) return;
  clearTimeout(palettePreviewTimer);
  palettePreviewTimer = null;
};

const disarmPalettePreview = () => {
  cancelPalettePreviewArm();
  cancelPalettePreviewTimer();
  palettePreviewArmed.value = false;
};

const armPalettePreview = () => {
  cancelPalettePreviewArm();
  palettePreviewArmed.value = true;
};

watch(profileOpen, (open) => {
  if (!open) {
    themePaletteOpen.value = false;
    restorePalettePreview();
  }
});

watch(themePaletteOpen, (open) => {
  if (!open) {
    disarmPalettePreview();
    restorePalettePreview();
    return;
  }

  disarmPalettePreview();
  palettePreviewArmFrame = requestAnimationFrame(() => {
    palettePreviewArmFrame = requestAnimationFrame(() => {
      palettePreviewArmFrame = 0;
      if (themePaletteOpen.value) palettePreviewArmed.value = true;
    });
  });
});

const previewPalettePreset = (id: ThemePresetId) => {
  if (!palettePreviewArmed.value) return;
  if (previewedThemePresetId.value === id) {
    cancelPalettePreviewTimer();
    return;
  }

  cancelPalettePreviewTimer();
  palettePreviewTimer = setTimeout(() => {
    palettePreviewTimer = null;
    if (!palettePreviewArmed.value || !themePaletteOpen.value) return;

    const preset = getThemePreset(id);
    if (!preset || !import.meta.client) return;

    previewedThemePresetId.value = id;
    document.documentElement.dataset.themePreset = id;
    applyPrimaryColor(preset.accent);
  }, PALETTE_PREVIEW_DELAY_MS);
};

function restorePalettePreview() {
  cancelPalettePreviewTimer();
  if (!previewedThemePresetId.value || !import.meta.client) return;

  previewedThemePresetId.value = null;
  document.documentElement.dataset.themePreset = currentThemePresetId.value;
  applyCurrentThemeColor();
}

const applyPalettePreset = (id: ThemePresetId) => {
  const preset = getThemePreset(id);
  if (!preset || isThemeRevealActive()) return;

  restorePalettePreview();

  if (currentAppearanceMode.value !== "withSystem") {
    selectThemePreset(id);
    return;
  }

  applyPrimaryColor(preset.accent);
  if (resolvedPaletteMode.value === "dark") {
    setDarkThemePreset(id);
    setPrimaryColorDark(preset.accent);
  } else {
    setLightThemePreset(id);
    setPrimaryColorLight(preset.accent);
  }

  try {
    void desktopEmit("primary-color-changed", { hex: preset.accent, mode: resolvedPaletteMode.value });
  } catch {}
};

watch(
  () => userTheme.value,
  () => {
    applyCurrentThemeColor();
  }
);

function applyCurrentThemeColor(broadcast = false) {
  const modeNow = (userTheme.value as string) || "light";
  const hexNow = modeNow === "dark" ? primaryColorDark.value : primaryColorLight.value;

  if (hexNow) {
    applyPrimaryColor(hexNow);
    if (broadcast) {
      void desktopEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
    }
  }
}

function openLoginPage(accountId?: string, prefill?: LoginSitePrefill) {
  profileOpen.value = false;
  if (prefill) desktopLogin.openLoginPage(accountId, prefill);
  else desktopLogin.openLoginPage(accountId);
}

/**
 * @description 清除认证信息
 */
async function clearAuthInfo() {
  profileOpen.value = false;
  if (!(await confirmLeaveCurrentSiteSessions("logout"))) return;
  if (!isDesktopRuntime()) {
    redirectToWebLogout();
    return;
  }
  await userInfoStore.deleteUserData(currentAccountId.value);
  if (loggedIn.value) return;
  await navigateTo(localePath({ path: "/" }));
}

async function lockCurrentSession() {
  profileOpen.value = false;
  try {
    if (isDesktopRuntime()) await desktopInvoke("client_lock");
    else await lockWebSession();
  } catch (error) {
    addErrorToast({ title: t("ClientLock.LoadFailed"), error });
  }
}

function openAddSite() {
  profileOpen.value = false;
  openLoginPage("");
}

async function openUserSettings() {
  profileOpen.value = false;
  await openSettings("/setting/user");
}

async function openPreferences() {
  profileOpen.value = false;
  await openSettings();
}

async function openTools() {
  profileOpen.value = false;
  await navigateTo(localePath("videoplayer"));
}

onMounted(() => applyCurrentThemeColor());

onBeforeUnmount(() => {
  disarmPalettePreview();
  restorePalettePreview();
});
</script>

<template>
  <UPopover
    v-model:open="profileOpen"
    :content="{
      align: 'end',
      side: 'bottom',
      sideOffset: 8,
      onOpenAutoFocus: handleProfileOpenAutoFocus,
      onInteractOutside: handleProfileInteractOutside
    }"
    :ui="{
      content:
        'max-h-[calc(100dvh-4rem)] w-64 overflow-x-hidden overflow-y-auto rounded-[length:var(--app-radius)] bg-[var(--app-surface-overlay)] p-0 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
    }"
  >
    <UTooltip arrow :text="accountTooltip">
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="accountTooltip"
        :class="[headerIconButtonClass, profileOpen ? headerIconButtonActiveClass : '']"
        @pointerdown="profileOpenedByPointer = true"
        @keydown="profileOpenedByPointer = false"
      >
        <UIcon :name="loggedIn ? 'i-lucide-circle-user-round' : 'i-lucide-menu'" class="size-4" />
      </UButton>
    </UTooltip>

    <template #content>
      <div class="w-full">
        <template v-if="loggedIn">
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="h-auto items-center justify-start gap-3 rounded-none rounded-t-[length:var(--app-radius)] px-3 py-3 text-left"
            :ui="{ base: 'rounded-none rounded-t-[length:var(--app-radius)]' }"
            @click="openUserSettings"
          >
            <UAvatar :alt="currentUser?.name || t('Common.User')" color="primary" size="md" class="shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-highlighted">
                {{ currentUser?.name || t("Common.User") }}
              </span>
              <span class="mt-0.5 block truncate text-xs font-normal text-muted" :title="accountSite">
                <SiteCertificateAddress
                  v-if="isDesktopRuntime()"
                  :site="currentUser?.site || ''"
                  :name="currentUser?.siteName"
                />
                <template v-else>{{ accountSite }}</template>
              </span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          </UButton>
        </template>

        <div v-else class="p-1.5">
          <UButton
            :label="t('Common.Login')"
            icon="i-lucide-log-in"
            color="primary"
            variant="soft"
            size="sm"
            block
            class="justify-start"
            @click="openLoginPage()"
          />
        </div>

        <div class="px-2">
          <USeparator :ui="menuSeparatorUi" />
        </div>
        <div class="space-y-2.5 p-2">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 px-1 text-[11px] font-medium text-muted">
              <UIcon name="i-lucide-languages" class="size-3.5" />
              <span>{{ t("Common.Language") }}</span>
              <span class="ms-auto text-[11px] font-normal text-muted">{{ currentLanguageLabel }}</span>
            </div>
            <UTabs
              v-model="selectedPrimaryLanguage"
              :items="primaryLanguageItems"
              value-key="id"
              :content="false"
              color="neutral"
              variant="pill"
              size="xs"
              :ui="menuTabsUi"
            />
            <UPopover
              v-if="extraLanguageItems.length"
              v-model:open="moreLanguagesOpen"
              :content="{ align: 'start', side: 'left', sideOffset: 8 }"
              :ui="{
                content:
                  'w-56 max-h-80 overflow-y-auto rounded-[length:var(--app-radius)] bg-[var(--app-surface-overlay)] p-1.5 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
              }"
            >
              <UButton color="neutral" variant="ghost" size="sm" block class="h-8 justify-start gap-2 px-2">
                <span class="min-w-0 flex-1 truncate text-left text-xs">{{ t("Common.More") }}</span>
                <span class="text-[10px] text-muted">{{ extraLanguageLabel }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-muted" />
              </UButton>

              <template #content>
                <div data-profile-nested-popover class="space-y-0.5">
                  <UButton
                    v-for="item in extraLanguageItems"
                    :key="item.id"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    block
                    class="justify-start gap-2"
                    @click="selectExtraLanguage(item.id)"
                  >
                    <span class="min-w-0 flex-1 truncate text-left text-xs">{{ item.label }}</span>
                    <UIcon v-if="locale === item.id" name="i-lucide-check" class="size-3.5 shrink-0 text-primary" />
                  </UButton>
                </div>
              </template>
            </UPopover>
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center gap-2 px-1 text-[11px] font-medium text-muted">
              <UIcon name="i-lucide-palette" class="size-3.5" />
              <span>{{ t("Common.Theme") }}</span>
              <span class="ms-auto text-[11px] font-normal text-muted">{{ currentAppearanceLabel }}</span>
            </div>
            <div @pointerdown="onThemePointerDown">
              <UTabs
                v-model="selectedAppearanceMode"
                :items="appearanceModes"
                value-key="id"
                :content="false"
                color="neutral"
                variant="pill"
                size="xs"
                :ui="menuTabsUi"
              />
            </div>
            <UPopover
              v-model:open="themePaletteOpen"
              :content="{
                align: 'start',
                side: 'left',
                sideOffset: 8,
                onOpenAutoFocus: handlePaletteOpenAutoFocus,
                onInteractOutside: handlePaletteInteractOutside
              }"
              :ui="{
                content:
                  'w-56 max-h-80 overflow-y-auto rounded-[length:var(--app-radius)] bg-[var(--app-surface-overlay)] p-1.5 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
              }"
            >
              <UButton color="neutral" variant="ghost" size="sm" block class="h-8 justify-start gap-2 px-2">
                <span
                  class="size-2.5 shrink-0 rounded-full ring-1 ring-(--app-border)"
                  :style="{ backgroundColor: currentThemeAccent }"
                />
                <span class="min-w-0 flex-1 truncate text-left text-xs">{{ currentThemePresetLabel }}</span>
                <span class="text-[10px] text-muted">{{ t("Common.Appearance") }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-muted" />
              </UButton>

              <template #content>
                <div
                  data-profile-nested-popover
                  class="space-y-0.5"
                  @pointermove="armPalettePreview"
                  @pointerleave="restorePalettePreview"
                  @focusout="restorePalettePreview"
                >
                  <UButton
                    v-for="item in visibleThemePresets"
                    :key="item.id"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    block
                    class="justify-start gap-2"
                    @pointerenter="previewPalettePreset(item.id)"
                    @focus="previewPalettePreset(item.id)"
                    @click="applyPalettePreset(item.id)"
                  >
                    <span
                      class="size-2.5 shrink-0 rounded-full ring-1 ring-(--app-border)"
                      :style="{ backgroundColor: item.baseColor || item.accent }"
                    />
                    <span class="min-w-0 flex-1 truncate text-left text-xs">{{ themePresetLabel(item) }}</span>
                    <UIcon
                      v-if="currentThemePresetId === item.id"
                      name="i-lucide-check"
                      class="size-3.5 shrink-0 text-primary"
                    />
                  </UButton>
                </div>
              </template>
            </UPopover>
          </div>
        </div>

        <div class="px-2">
          <USeparator :ui="menuSeparatorUi" />
        </div>
        <div class="p-1.5">
          <UButton
            :label="t('Common.Settings')"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            :ui="menuShortcutButtonUi"
            @click="openPreferences"
          >
            <template #trailing>
              <span class="ms-auto flex items-center gap-px">
                <UKbd value="meta" size="sm" />
                <UKbd value="," size="sm" />
              </span>
            </template>
          </UButton>
          <UButton
            v-if="!isDesktopRuntime()"
            :label="t('Setting.DownloadClient')"
            icon="i-lucide-download"
            :to="downloadCenterUrl"
            external
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="profileOpen = false"
          />
          <UButton
            v-if="isDesktopRuntime()"
            :label="t('Menu.MyTools')"
            icon="i-lucide-wrench"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            :ui="menuShortcutButtonUi"
            @click="openTools"
          >
            <template #trailing>
              <span class="ms-auto flex items-center gap-px">
                <UKbd value="meta" size="sm" />
                <UKbd value="shift" size="sm" />
                <UKbd value="," size="sm" />
              </span>
            </template>
          </UButton>
          <UPopover
            v-if="isDesktopRuntime()"
            :content="{ align: 'start', side: 'left', sideOffset: 8 }"
            :ui="{
              content:
                'w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[length:var(--app-radius)] bg-[var(--app-surface-overlay)] p-1.5 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
            }"
          >
            <UButton
              :label="t('Login.SwitchSite')"
              icon="i-lucide-arrow-left-right"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              class="justify-start"
            >
              <template #trailing>
                <UIcon name="i-lucide-chevron-right" class="ms-auto size-3.5 shrink-0 text-muted" />
              </template>
            </UButton>

            <template #content>
              <div data-profile-nested-popover>
                <SiteAccounts @select="profileOpen = false" />
                <USeparator v-if="Object.keys(userMap).length" class="my-1.5" :ui="menuSeparatorUi" />
                <UButton
                  :label="t('Login.AddAccount')"
                  icon="i-lucide-user-round-plus"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  block
                  class="justify-start"
                  @click="openAddSite"
                />
              </div>
            </template>
          </UPopover>
        </div>

        <div v-if="loggedIn" class="px-2">
          <USeparator :ui="menuSeparatorUi" />
        </div>
        <div v-if="loggedIn" class="p-1.5">
          <UButton
            v-if="isDesktopRuntime() || webLockState.session"
            :label="t('ScreenLock.LockNow')"
            icon="i-lucide-lock-keyhole"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            :ui="menuShortcutButtonUi"
            @click="lockCurrentSession"
          >
            <template v-if="isDesktopRuntime() && shortcuts.kbds('lockClient').length" #trailing>
              <span class="ms-auto flex items-center gap-px">
                <UKbd v-for="(key, index) in shortcuts.kbds('lockClient')" :key="index" :value="key" size="sm" />
              </span>
            </template>
          </UButton>
          <USeparator v-if="isDesktopRuntime() || webLockState.session" class="my-1.5" :ui="menuSeparatorUi" />
          <UButton
            :label="t('Login.Logout')"
            icon="i-lucide-log-out"
            color="error"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="clearAuthInfo"
          />
        </div>
      </div>
    </template>
  </UPopover>

  <DesktopLoginPanel
    v-if="isDesktopRuntime()"
    :title="t(addingSite ? 'Login.LoginOtherAccount' : 'Common.Login')"
    closable
  />
</template>
