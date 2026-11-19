<script setup lang="ts">
import type { SiteCertificateInfo } from "~/composables/useSiteCertificatePolicy";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { toIntlLocale } from "../../i18n/language";

const props = defineProps<{ site: string; snapshot?: SiteCertificateInfo | null }>();
const open = defineModel<boolean>("open", { required: true });
const { t, locale } = useI18n();
const certificate = shallowRef<SiteCertificateInfo | null>(null);
const loading = ref(false);
const activeTab = ref("basic");
const tabs = computed(() => [
  { label: t("SiteCertificate.BasicInfo"), value: "basic" },
  { label: t("SiteCertificate.DetailedInfo"), value: "details" }
]);
const domain = computed(() => {
  const site = certificate.value?.origin || props.site;
  try {
    return new URL(site).hostname;
  } catch {
    return site || "—";
  }
});
let revision = 0;

async function loadCertificate() {
  const target = props.site;
  const current = ++revision;
  loading.value = false;
  if (!open.value) return;
  certificate.value = null;
  if (!target || !isDesktopRuntime()) return;
  loading.value = true;
  try {
    const result = await desktopInvoke<SiteCertificateInfo | null>("site_certificate_info", { site: target });
    if (revision === current && target === props.site) {
      certificate.value = result;
    }
  } catch {
    // A missing certificate is distinct from successfully verifying one.
  } finally {
    if (revision === current) loading.value = false;
  }
}

watch(
  [open, () => props.site, () => props.snapshot],
  () => {
    revision += 1;
    loading.value = false;
    if (!open.value) return;
    activeTab.value = "basic";
    if (props.snapshot !== undefined) certificate.value = props.snapshot;
    else void loadCertificate();
  },
  { immediate: true }
);

const certificateDate = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString(toIntlLocale(locale.value)) : "—";
const basicRows = computed(() => {
  const info = certificate.value;
  if (!info) return [];
  return [
    ["Subject", info.subjectName],
    ["Domains", info.domains],
    ["Issuer", info.issuerName],
    ["ValidFrom", certificateDate(info.validStart)],
    ["ValidUntil", certificateDate(info.validExpiry)]
  ];
});
const detailRows = computed(() => {
  const info = certificate.value;
  if (!info) return [];
  return [
    ["Subject", info.subject || info.subjectName],
    ["Issuer", info.issuer || info.issuerName],
    ["SerialNumber", info.serialNumber],
    ["Domains", info.domains],
    ["ValidFrom", certificateDate(info.validStart)],
    ["ValidUntil", certificateDate(info.validExpiry)],
    ["PublicKeyAlgorithm", info.publicKeyAlgorithm?.toUpperCase()],
    ...(info.publicKeyBits
      ? [["PublicKeyBits", t("SiteCertificate.PublicKeySizeValue", { bits: info.publicKeyBits })]]
      : []),
    ...(info.publicKeyCurve ? [["PublicKeyCurve", info.publicKeyCurve]] : []),
    ["Fingerprint", info.fingerprint],
    ["FingerprintSha1", info.fingerprintSha1]
  ];
});
</script>

<template>
  <ModalMessageDialog
    v-model:open="open"
    :title="t('SiteCertificate.CertificateViewer', { domain })"
    :ui="{
      ...(certificate ? { content: 'w-[560px] max-w-[calc(100vw-2rem)] h-[600px]' } : {}),
      body: 'flex min-h-0 flex-col overflow-hidden p-5 sm:p-5'
    }"
  >
    <template #body>
      <UTabs
        v-if="certificate"
        v-model="activeTab"
        :items="tabs"
        variant="link"
        class="min-h-0 w-full flex-1"
        :ui="{
          list: 'shrink-0 justify-start border-0 p-0',
          indicator: 'hidden',
          trigger: 'flex-none cursor-pointer justify-start gap-0 rounded-none px-0 text-left',
          content: 'min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]'
        }"
      >
        <template #leading="{ index }">
          <span v-if="index > 0" aria-hidden="true" class="mx-3 h-3 border-l border-default" />
        </template>
        <template #content="{ item }">
          <div class="space-y-4 pt-3">
            <dl class="space-y-3 text-sm">
              <div v-for="[label, value] in item.value === 'basic' ? basicRows : detailRows" :key="label">
                <dt class="text-muted">{{ t(`SiteCertificate.${label}`) }}</dt>
                <dd class="mt-1 select-text whitespace-pre-wrap break-all text-highlighted">
                  {{ value || "—" }}
                </dd>
              </div>
            </dl>
            <UCollapsible v-if="item.value === 'details' && certificate.raw">
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                class="px-0"
                trailing-icon="i-lucide-chevron-down"
                :label="t('SiteCertificate.RawCertificate')"
              />
              <template #content>
                <pre class="mt-2 max-h-48 select-text overflow-auto rounded bg-(--app-surface-panel) p-3 text-xs">{{
                  certificate.raw
                }}</pre>
              </template>
            </UCollapsible>
          </div>
        </template>
      </UTabs>
      <div v-else class="flex min-h-16 items-center text-sm text-muted" role="status">
        <p>{{ t(loading ? "Loading.Loading" : "SiteCertificate.NoCertificateInfo") }}</p>
      </div>
    </template>
  </ModalMessageDialog>
</template>
