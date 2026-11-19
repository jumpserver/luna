<script setup lang="ts">
import { useSiteCertificatePolicy } from "~/composables/useSiteCertificatePolicy";

const props = defineProps<{
  site: string;
  name?: string;
  tooltip?: string;
  disableTooltip?: boolean;
  iconTooltipOnly?: boolean;
}>();
const { t } = useI18n();
const { policy } = useSiteCertificatePolicy(() => props.site);
const displayName = computed(() => (props.name && props.name !== props.site ? props.name : ""));
const label = computed(() => (displayName.value ? `${props.site} · ${displayName.value}` : props.site));
const protocol = computed(() => props.site.match(/^https?:\/\//i)?.[0] || "");
const scheme = computed(() => protocol.value.slice(0, -3));
const address = computed(() => props.site.slice(protocol.value.length));
const insecureHttp = computed(() => isDesktopRuntime() && protocol.value.toLowerCase() === "http://");
const verificationDisabled = computed(() => policy.value?.verifyCertificate === false);
const certificateUntrusted = computed(() => policy.value?.certificateVerified === false);
const connectionSecure = computed(
  () => policy.value?.verifyCertificate === true && policy.value.certificateVerified === true
);
const warning = computed(() =>
  insecureHttp.value
    ? t("SiteCertificate.HttpWarning")
    : verificationDisabled.value
      ? t("SiteCertificate.DisabledWarning")
      : certificateUntrusted.value
        ? t("SiteCertificate.ConnectionFailedTitle")
        : ""
);
const securityIcon = computed(() =>
  insecureHttp.value
    ? { name: "i-lucide-shield-alert", color: "text-warning" }
    : verificationDisabled.value || certificateUntrusted.value
      ? { name: "i-lucide-triangle-alert", color: "text-error" }
      : connectionSecure.value
        ? { name: "i-lucide-lock", color: "text-success" }
        : null
);
</script>

<template>
  <UTooltip
    :text="props.tooltip ?? (warning || label)"
    :content="{ side: 'top', align: 'center' }"
    :disabled="props.disableTooltip || props.iconTooltipOnly"
  >
    <span
      class="inline-flex min-w-0 max-w-full items-center align-bottom"
      :aria-label="warning ? `${label} ${warning}` : label"
    >
      <UTooltip
        v-if="props.iconTooltipOnly && securityIcon"
        :text="warning || t('SiteCertificate.VerificationPassed')"
        :content="{ side: 'top', align: 'center' }"
        :disabled="props.disableTooltip"
      >
        <UIcon
          :name="securityIcon.name"
          class="mr-3 size-3.5 shrink-0 align-middle"
          :class="securityIcon.color"
          aria-hidden="true"
        />
      </UTooltip>
      <UIcon
        v-else-if="securityIcon"
        :name="securityIcon.name"
        class="mr-1 size-3 shrink-0 align-middle"
        :class="securityIcon.color"
        aria-hidden="true"
      />
      <span class="shrink-0" v-text="scheme" />
      <span v-if="protocol" class="shrink-0">://</span>
      <span class="truncate" v-text="address" />
      <template v-if="displayName">
        <span class="shrink-0 whitespace-pre" v-text="' · '" />
        <span class="max-w-[40%] shrink-0 truncate" v-text="displayName" />
      </template>
    </span>
  </UTooltip>
</template>
