<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

interface SiteSuggestion {
  label: string;
  value: string;
  onSelect?: () => void;
}

const props = defineProps<{ inline?: boolean }>();
const { t } = useI18n();
const userInfoStore = useUserInfoStore();
const {
  inputSite,
  inputSiteName,
  focusField,
  focusRequest,
  normalizedInputSite,
  openModal,
  inlineVisible,
  loginBtn,
  validationField,
  errorMessage,
  hasValidationError,
  siteSuggestions,
  removeRecentSite,
  clearRecentSites,
  selectSiteSuggestion,
  openLoginPage,
  updateSite,
  handleClearInput,
  handleSiteNameInputSanitize,
  handleConfirm
} = useDesktopLogin();

function httpsOrigin(site: string) {
  try {
    const url = new URL(site);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
  } catch {
    return "";
  }
}

const hasSavedSite = computed(() => {
  const origin = httpsOrigin(normalizedInputSite.value);
  // Certificate settings belong to the HTTPS origin, shared by every saved account on it.
  return Boolean(
    origin && Object.values(userInfoStore.userMap).some((account) => httpsOrigin(account.site) === origin)
  );
});

const inputRef = ref<{ inputRef?: HTMLInputElement; viewportRef?: HTMLElement } | null>(null);
const certificateSettingsRef = ref<{
  checkCertificate: () => Promise<void>;
  canLogin: (site: string) => boolean;
  loginDisabledReason: (site: string) => string;
} | null>(null);
const certificateAllowsLogin = computed(
  () =>
    !/^https:/i.test(normalizedInputSite.value) ||
    certificateSettingsRef.value?.canLogin(normalizedInputSite.value) === true
);
const loginDisabled = computed(() => loginBtn.value || !certificateAllowsLogin.value);
const loginDisabledReason = computed(() => {
  if (loginBtn.value) return t("Loading.Loading");
  if (certificateAllowsLogin.value) return "";
  return certificateSettingsRef.value?.loginDisabledReason(normalizedInputSite.value) || t("Loading.Loading");
});
const submitLogin = async () => {
  // A disabled button is not enough: implicit form submissions must use the same certificate gate.
  await nextTick();
  if (!certificateAllowsLogin.value) return;
  await handleConfirm();
};
const siteNameInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null);
watch(focusRequest, async () => {
  await nextTick();
  if (props.inline ? !inlineVisible.value : !openModal.value) return;
  const field = focusField.value === "name" ? siteNameInputRef : inputRef;
  field.value?.inputRef?.focus();
});
const suggestionsOpen = ref(false);
const suggestionQuery = ref("");
const matchingSuggestions = computed<SiteSuggestion[]>(() => {
  // Let hideWhenEmpty hide exact matches without closing the combobox or moving input focus.
  if (siteSuggestions.value.some((site) => site.toLowerCase() === suggestionQuery.value)) return [];
  return siteSuggestions.value
    .filter((site) => site.toLowerCase().includes(suggestionQuery.value))
    .map((site) => ({
      label: site,
      value: site,
      onSelect: () => {
        selectSiteSuggestion(site);
        suggestionsOpen.value = false;
        suggestionQuery.value = site.toLowerCase();
        void nextTick(() => certificateSettingsRef.value?.checkCertificate());
      }
    }));
});
const handleSiteFocus = (event: FocusEvent) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  suggestionQuery.value = event.target.value.trim().toLowerCase();
};
const handleSiteTyping = (event: Event) => {
  if ((event as InputEvent).isComposing) return;
  suggestionQuery.value = (event.target as HTMLInputElement).value.trim().toLowerCase();
};
const handleSiteCompositionEnd = async (event: CompositionEvent) => {
  // Let the input commit its composition before updating the suggestions.
  await nextTick();
  handleSiteTyping(event);
};
const clearSiteInput = async () => {
  handleClearInput();
  suggestionQuery.value = "";
  // Focus reads the native input value; clear it in the DOM before opening recent sites.
  await nextTick();
  inputRef.value?.inputRef?.focus();
  suggestionsOpen.value = true;
};
const handleSiteBlur = (event: FocusEvent) => {
  // Closing the menu also emits a synthetic blur while the native input still has focus.
  if (event.target !== inputRef.value?.inputRef) return;
  // A pointer press focuses the option before its click selects the address.
  if (event.relatedTarget instanceof Node && inputRef.value?.viewportRef?.contains(event.relatedTarget)) return;
  suggestionsOpen.value = false;
  if (event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-certificate-view]")) return;
  void nextTick(() => certificateSettingsRef.value?.checkCertificate());
};
onMounted(() => {
  if (!props.inline) return;
  inlineVisible.value = true;
  openLoginPage();
});
onBeforeUnmount(() => {
  if (props.inline) inlineVisible.value = false;
});
</script>

<template>
  <div class="space-y-5">
    <form class="space-y-4" @submit.prevent="submitLogin">
      <UFormField
        :label="t('Login.SiteAddress')"
        name="site"
        :error="validationField === 'site' ? errorMessage : undefined"
      >
        <div class="group/site-input relative">
          <UInputMenu
            ref="inputRef"
            :model-value="inputSite"
            mode="autocomplete"
            :items="matchingSuggestions"
            value-key="value"
            :open="suggestionsOpen"
            :content="{ hideWhenEmpty: true }"
            ignore-filter
            :reset-search-term-on-blur="false"
            :disabled="loginBtn"
            open-on-focus
            open-on-click
            trailing-icon=""
            placeholder="https://example.com"
            autocapitalize="none"
            autocorrect="off"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
            :ui="{
              base: 'bg-default text-highlighted ring-accented placeholder:text-[var(--app-muted)] rounded-[length:var(--app-radius)]',
              content: 'bg-[var(--app-surface-overlay)] ring-[var(--app-border)] rounded-[length:var(--app-radius)]',
              item: 'cursor-pointer items-center data-highlighted:not-data-disabled:bg-[var(--app-hover-soft)] data-highlighted:not-data-disabled:before:hidden hover:bg-[var(--app-hover-soft)]',
              empty: 'hidden'
            }"
            @update:model-value="updateSite(String($event ?? ''))"
            @update:open="suggestionsOpen = $event"
            @focus="handleSiteFocus"
            @input="handleSiteTyping"
            @compositionend="handleSiteCompositionEnd"
            @blur="handleSiteBlur"
            @keydown.tab="suggestionsOpen = false"
          >
            <template #trailing>
              <UButton
                v-if="inputSite"
                type="button"
                color="neutral"
                variant="link"
                size="xs"
                icon="i-lucide-x"
                class="opacity-0 transition-opacity group-hover/site-input:opacity-100 group-focus-within/site-input:opacity-100"
                :aria-label="t('Common.ClearInput')"
                :disabled="loginBtn"
                @pointerdown.stop.prevent
                @click.stop="clearSiteInput"
              />
            </template>
            <template #content-top>
              <div v-if="siteSuggestions.length" class="flex items-center justify-between px-2.5 py-1.5">
                <span class="text-sm font-medium text-muted">{{ t("Login.RecentSites") }}</span>
                <UButton
                  type="button"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  class="text-muted hover:text-muted"
                  :aria-label="t('Login.ClearRecentSites')"
                  @pointerdown.stop.prevent
                  @keydown.enter.stop
                  @keydown.space.stop
                  @click.stop.prevent="clearRecentSites()"
                />
              </div>
            </template>
            <template #item-label="{ item }">
              <SiteCertificateAddress :site="item.value" disable-tooltip />
            </template>
            <template #item-trailing="{ item }">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-x"
                :ui="{ leadingIcon: 'size-3' }"
                class="text-muted opacity-0 transition-opacity hover:text-muted group-hover:opacity-100 focus-visible:opacity-100"
                :aria-label="t('Login.RemoveRecentSite')"
                @pointerdown.stop.prevent
                @keydown.enter.stop
                @keydown.space.stop
                @click.stop.prevent="removeRecentSite(item.value)"
              />
            </template>
          </UInputMenu>
        </div>
      </UFormField>

      <UFormField
        :label="t('Login.SiteName')"
        name="siteName"
        :error="validationField === 'name' ? errorMessage : undefined"
      >
        <UInput
          ref="siteNameInputRef"
          v-model="inputSiteName"
          :disabled="loginBtn"
          autocomplete="off"
          @input="handleSiteNameInputSanitize"
        />
      </UFormField>

      <SiteCertificateSettings
        ref="certificateSettingsRef"
        :site="normalizedInputSite"
        :disabled="loginBtn"
        :use-saved-policy="hasSavedSite"
        checkbox
        login-mode
      />

      <p v-if="hasValidationError && !validationField" role="alert" class="text-sm text-error">{{ errorMessage }}</p>

      <div class="flex justify-end gap-2 pt-1">
        <UTooltip
          :text="loginDisabledReason"
          :disabled="!loginDisabled"
          :content="{ side: 'top', align: 'center' }"
          :delay-duration="150"
        >
          <span
            class="block w-full"
            :class="{ 'cursor-not-allowed': loginDisabled }"
            :tabindex="loginDisabled ? 0 : undefined"
            :aria-label="loginDisabledReason || undefined"
          >
            <UButton
              type="submit"
              :loading="loginBtn"
              :disabled="loginDisabled"
              :class="{ 'pointer-events-none': loginDisabled }"
              block
            >
              {{ t("Common.Login") }}
            </UButton>
          </span>
        </UTooltip>
      </div>
    </form>
  </div>
</template>
