<script setup lang="ts">
import type { SiteCertificateInfo } from "~/composables/useSiteCertificatePolicy";
import { useSiteCertificatePolicy } from "~/composables/useSiteCertificatePolicy";
import { desktopInvoke } from "~/shared/desktop/bridge";

const props = withDefaults(
  defineProps<{
    site: string;
    disabled?: boolean;
    checkbox?: boolean;
    showCertificateLink?: boolean;
    compactInline?: boolean;
    loginMode?: boolean;
    useSavedPolicy?: boolean;
    showCheckResult?: boolean;
    deferred?: boolean;
  }>(),
  { showCheckResult: true }
);
const { t } = useI18n();
const detailsOpen = ref(false);
const helpOpen = ref(false);
const { origin, policy, loading, saving, error, refresh, setVerification } = useSiteCertificatePolicy(() => props.site);
const checkMessages = {
  checking: "CertificateChecking",
  valid: "CertificateValid",
  untrusted: "ConnectionFailedTitle",
  expired: "CertificateExpired",
  mismatch: "CertificateDomainMismatch",
  invalid: "CertificateInvalid",
  unavailable: "CertificateUnavailable"
} as const;
const checkStatus = ref<keyof typeof checkMessages | null>(null);
const checkedCertificate = shallowRef<SiteCertificateInfo | null>();
// Unsaved login sites start with verification enabled; saved accounts keep their shared policy.
// Persist that choice only when the user finishes entering the address or changes the checkbox.
const strictLoginDefault = computed(() => props.loginMode && !props.useSavedPolicy);
const loginVerificationEnabled = ref(true);
const draftVerification = ref<boolean>();
let disableRiskAccepted = false;
const verifyCertificate = computed(() =>
  props.deferred
    ? (draftVerification.value ?? policy.value?.verifyCertificate ?? true)
    : strictLoginDefault.value
      ? loginVerificationEnabled.value
      : (policy.value?.verifyCertificate ?? true)
);
const hasChanges = computed(
  () =>
    props.deferred &&
    draftVerification.value !== undefined &&
    draftVerification.value !== policy.value?.verifyCertificate
);
let checkRevision = 0;
const checkNotice = computed(() => {
  const status = checkStatus.value;
  if (!status) return null;
  return {
    text: t(`SiteCertificate.${checkMessages[status]}`),
    color:
      status === "valid"
        ? "text-success"
        : status === "checking"
          ? "text-muted"
          : status === "unavailable"
            ? "text-warning"
            : "text-error",
    icon:
      status === "valid"
        ? "i-lucide-circle-check"
        : status === "checking"
          ? "i-lucide-loader-circle"
          : status === "unavailable"
            ? "i-lucide-triangle-alert"
            : "i-lucide-circle-x"
  };
});

function resetCheck() {
  checkRevision += 1;
  checkStatus.value = null;
  checkedCertificate.value = undefined;
}

function setCheckResult(result: SiteCertificateInfo | null) {
  checkedCertificate.value = result;
  if (!verifyCertificate.value) {
    checkStatus.value = null;
    return;
  }
  const now = Date.now() / 1000;
  checkStatus.value = !result
    ? "unavailable"
    : result.error.includes("CERT_DATE_INVALID") ||
        (result.error === "OK" && (now < result.validStart || now > result.validExpiry))
      ? "expired"
      : result.error === "OK"
        ? "valid"
        : result.error.includes("CERT_COMMON_NAME_INVALID")
          ? "mismatch"
          : result.error.includes("CERT_AUTHORITY_INVALID")
            ? "untrusted"
            : "invalid";
}

async function checkCertificate(enableVerification = false) {
  const target = origin.value;
  if (
    !target ||
    props.disabled ||
    (!verifyCertificate.value && !enableVerification) ||
    checkStatus.value === "checking"
  )
    return;
  const revision = ++checkRevision;
  checkStatus.value = "checking";
  checkedCertificate.value = undefined;
  try {
    if (!policy.value || loading.value) await refresh();
    if (revision !== checkRevision || target !== origin.value) return;
    if (
      !props.deferred &&
      (enableVerification || strictLoginDefault.value) &&
      policy.value?.verifyCertificate === false
    )
      await setVerification(true);
    if (revision !== checkRevision || target !== origin.value) return;
    if (!policy.value || (!props.deferred && (!policy.value.verifyCertificate || error.value))) {
      checkStatus.value = null;
      return;
    }
    const result = await desktopInvoke<SiteCertificateInfo | null>("site_certificate_info", { site: target });
    if (revision !== checkRevision || target !== origin.value) return;
    setCheckResult(result);
  } catch {
    if (revision === checkRevision && target === origin.value) setCheckResult(null);
  }
}

watch(
  [origin, () => props.site, strictLoginDefault, () => props.deferred],
  () => {
    resetCheck();
    draftVerification.value = undefined;
    disableRiskAccepted = false;
    loginVerificationEnabled.value = true;
    detailsOpen.value = false;
  },
  { flush: "sync" }
);
watch(
  () => policy.value?.verifyCertificate,
  (enabled) => {
    if (
      enabled === false &&
      (!props.deferred || draftVerification.value !== true) &&
      (!strictLoginDefault.value || checkStatus.value !== "checking")
    )
      resetCheck();
  }
);
watch([() => props.showCertificateLink, () => policy.value?.verifyCertificate, loading, saving], () => {
  if (
    !props.deferred &&
    props.showCheckResult !== false &&
    props.showCertificateLink &&
    policy.value?.verifyCertificate &&
    !loading.value &&
    !saving.value &&
    !checkStatus.value
  )
    void checkCertificate();
});
onBeforeUnmount(resetCheck);

function canLogin(site: string) {
  if (!/^https:/i.test(site)) return true;
  if (site !== props.site || !origin.value || loading.value || saving.value || error.value || !policy.value)
    return false;
  return verifyCertificate.value
    ? policy.value.verifyCertificate && checkStatus.value === "valid"
    : !policy.value.verifyCertificate;
}

function isInsecure(site: string) {
  return site === props.site && (!verifyCertificate.value || checkNotice.value?.color === "text-error");
}

function loginDisabledReason(site: string) {
  if (canLogin(site)) return "";
  if (!origin.value) return t("Login.InvalidUrlError");
  if (loading.value || saving.value) return t("Loading.Loading");
  if (error.value) return t(`SiteCertificate.${error.value === "save" ? "SaveFailed" : "LoadFailed"}`);
  if (site === props.site && checkStatus.value !== "valid" && checkNotice.value) return checkNotice.value.text;
  return t("SiteCertificate.CheckBeforeLogin");
}

const disablingSite = ref("");
const busy = computed(
  () => loading.value || saving.value || checkStatus.value === "checking" || Boolean(disablingSite.value)
);
defineExpose({ checkCertificate, canLogin, isInsecure, loginDisabledReason, saveChanges, hasChanges, busy });
const disableConfirmOpen = computed({
  get: () => Boolean(disablingSite.value),
  set: (open) => {
    if (!open && !saving.value) disablingSite.value = "";
  }
});

async function requestVerification(enabled: boolean) {
  if (props.disabled || loading.value || saving.value || !policy.value) return;
  if (verifyCertificate.value === enabled) return;
  if (!enabled) {
    disablingSite.value = origin.value;
    return;
  }
  if (props.deferred) {
    draftVerification.value = true;
    disableRiskAccepted = false;
  } else if (strictLoginDefault.value) loginVerificationEnabled.value = true;
  resetCheck();
  // Start checking before saving, so the policy watcher cannot start a second request.
  await checkCertificate(true);
}

async function confirmDisable() {
  const target = disablingSite.value;
  if (!target || target !== origin.value || props.disabled || loading.value || saving.value) return;
  if (props.deferred) {
    draftVerification.value = false;
    disableRiskAccepted = true;
    resetCheck();
    disablingSite.value = "";
    return;
  }
  await setVerification(false, true);
  if (
    disablingSite.value === target &&
    strictLoginDefault.value &&
    policy.value?.verifyCertificate === false &&
    !error.value
  ) {
    loginVerificationEnabled.value = false;
    resetCheck();
  }
  if (disablingSite.value === target) disablingSite.value = "";
}

async function saveChanges() {
  if (!props.deferred || !origin.value || !hasChanges.value) return true;
  if (busy.value || !policy.value) return false;
  const target = origin.value;
  const enabled = draftVerification.value!;
  if (!enabled && !disableRiskAccepted) return false;
  await setVerification(enabled, disableRiskAccepted);
  if (target !== origin.value || error.value || policy.value?.verifyCertificate !== enabled) return false;
  draftVerification.value = undefined;
  disableRiskAccepted = false;
  return true;
}

watch([origin, () => props.site, () => props.disabled], () => {
  disablingSite.value = "";
});
</script>

<template>
  <div v-if="origin" :class="compactInline ? 'shrink-0' : 'space-y-2'">
    <div
      :class="compactInline ? 'flex items-center gap-4' : 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2'"
    >
      <div class="flex min-w-0 items-center gap-1">
        <UCheckbox
          v-if="checkbox"
          :size="compactInline ? 'xs' : 'sm'"
          :model-value="verifyCertificate"
          :label="t('SiteCertificate.Verify')"
          :ui="{
            root: 'items-center',
            container: compactInline ? 'h-4' : 'h-5',
            label: showCertificateLink ? 'text-xs leading-4 font-normal text-muted' : 'text-sm text-highlighted'
          }"
          :disabled="disabled || loading || saving || !policy"
          @update:model-value="requestVerification($event === true)"
        />
        <span v-else class="text-sm text-highlighted">{{ t("SiteCertificate.Verify") }}</span>
        <UPopover v-model:open="helpOpen" :content="{ align: 'start' }">
          <UButton
            icon="i-lucide-circle-help"
            color="neutral"
            variant="link"
            size="xs"
            :ui="compactInline ? { leadingIcon: 'size-3' } : undefined"
            :class="compactInline ? 'p-0.5 text-muted' : undefined"
            :aria-label="t('DesktopMenu.Help')"
          />
          <template #content>
            <div class="max-w-xs space-y-2 p-3 text-xs leading-5 text-muted">
              <p>{{ t("SiteCertificate.PurposeHelp") }}</p>
              <p>{{ t("SiteCertificate.SharedHelp") }}</p>
              <p v-if="loginMode">{{ t("SiteCertificate.ReconnectHelp") }}</p>
            </div>
          </template>
        </UPopover>
      </div>
      <div class="ml-auto flex min-w-0 items-center justify-end gap-3">
        <USwitch
          v-if="!checkbox"
          :model-value="verifyCertificate"
          :aria-label="t('SiteCertificate.Verify')"
          :disabled="disabled || loading || saving || !policy"
          @update:model-value="requestVerification"
        />
        <UButton
          v-if="showCertificateLink && (showCheckResult === false || !verifyCertificate || !checkNotice)"
          data-certificate-view
          type="button"
          color="neutral"
          variant="link"
          size="xs"
          class="min-w-0 p-0 text-muted underline underline-offset-2"
          :disabled="disabled || loading || saving"
          @click="detailsOpen = true"
        >
          {{ t("SiteCertificate.ViewCertificate") }}
        </UButton>
        <UButton
          v-else-if="showCheckResult !== false && verifyCertificate && checkNotice"
          data-certificate-view
          type="button"
          color="neutral"
          variant="link"
          size="xs"
          class="min-w-0 p-0 text-left"
          :disabled="disabled || loading || saving || (checkStatus === 'checking' && checkedCertificate === undefined)"
          :aria-label="`${checkNotice.text} · ${t('SiteCertificate.ViewCertificate')}`"
          @click="detailsOpen = true"
        >
          <span role="status" class="flex items-center gap-1.5" :class="checkNotice.color">
            <UIcon
              :name="checkNotice.icon"
              class="size-3.5 shrink-0"
              :class="{ 'animate-spin': checkStatus === 'checking' }"
              aria-hidden="true"
            />
            <span class="underline decoration-current">{{ checkNotice.text }}</span>
          </span>
        </UButton>
      </div>
    </div>
    <ModalMessageDialog v-model:open="disableConfirmOpen" :title="t('SiteCertificate.DisableTitle')" :busy="saving">
      <template #body>
        <p class="break-words text-sm leading-5 text-muted">
          {{ t("SiteCertificate.DisableDescription", { site: disablingSite }) }}
        </p>
      </template>
      <template #footer>
        <UButton color="warning" :loading="saving" @click="confirmDisable">
          {{ t("SiteCertificate.DisableConfirm") }}
        </UButton>
      </template>
    </ModalMessageDialog>
    <SiteCertificateDetails
      v-model:open="detailsOpen"
      :site="origin"
      :snapshot="showCheckResult !== false && verifyCertificate ? checkedCertificate : undefined"
    />
    <div v-if="error" role="alert" class="flex items-center gap-2 text-xs text-error">
      <span>{{ t(error === "load" ? "SiteCertificate.LoadFailed" : "SiteCertificate.SaveFailed") }}</span>
      <UButton v-if="error === 'load'" color="neutral" variant="link" size="xs" @click="refresh">
        {{ t("ScreenLock.Retry") }}
      </UButton>
    </div>
  </div>
</template>
