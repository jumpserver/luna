import type { MaybeRefOrGetter } from "vue";
import type { DesktopUnlistenFn } from "~/shared/desktop/bridge";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export interface SiteCertificateInfo {
  origin: string;
  subjectName: string;
  issuerName: string;
  validStart: number;
  validExpiry: number;
  fingerprint: string;
  domains: string;
  error: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  publicKeyAlgorithm: string;
  publicKeyBits?: number;
  publicKeyCurve?: string;
  fingerprintSha1: string;
  raw: string;
}

interface SiteCertificatePolicy {
  origin: string;
  verifyCertificate: boolean;
  certificateVerified?: boolean | null;
}

export function useSiteCertificatePolicy(site: MaybeRefOrGetter<string>) {
  const origin = computed(() => {
    if (!isDesktopRuntime()) return "";
    try {
      const url = new URL(toValue(site));
      return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
    } catch {
      return "";
    }
  });
  const policy = shallowRef<SiteCertificatePolicy | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<"load" | "save" | null>(null);
  let revision = 0;
  let saveRevision = 0;
  let disposed = false;
  let unlisten: DesktopUnlistenFn | undefined;

  async function refresh() {
    const target = origin.value;
    const currentRevision = ++revision;
    policy.value = null;
    error.value = null;
    loading.value = Boolean(target);
    if (!target) return;
    try {
      const result = await desktopInvoke<SiteCertificatePolicy>("site_certificate_policy", { site: target });
      if (currentRevision === revision && !disposed && result.origin === target) policy.value = result;
    } catch {
      if (currentRevision === revision && !disposed) error.value = "load";
    } finally {
      if (currentRevision === revision) loading.value = false;
    }
  }

  async function setVerification(verifyCertificate: boolean, riskAccepted = false) {
    const target = origin.value;
    if (!target || saving.value || !policy.value) return;
    const currentRevision = ++revision;
    const currentSave = ++saveRevision;
    saving.value = true;
    error.value = null;
    try {
      // The main process requires explicit confirmation before persisting a disabled policy.
      const result = await desktopInvoke<SiteCertificatePolicy>("set_site_certificate_policy", {
        site: target,
        verifyCertificate,
        riskAccepted
      });
      if (currentRevision === revision && !disposed && result.origin === target) policy.value = result;
    } catch {
      if (currentRevision === revision && !disposed) error.value = "save";
    } finally {
      if (currentSave === saveRevision) saving.value = false;
    }
  }

  watch(
    origin,
    () => {
      saveRevision += 1;
      saving.value = false;
      void refresh();
    },
    { immediate: true }
  );

  onMounted(async () => {
    if (!isDesktopRuntime()) return;
    try {
      const stop = await desktopListen<SiteCertificatePolicy>("site-certificate-policy-changed", ({ payload }) => {
        if (payload?.origin !== origin.value || typeof payload.verifyCertificate !== "boolean") return;
        revision += 1;
        policy.value = payload;
        loading.value = false;
        error.value = null;
      });
      if (disposed) stop();
      else {
        unlisten = stop;
        await refresh();
      }
    } catch {
      if (!disposed) error.value = "load";
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    revision += 1;
    unlisten?.();
  });

  return { origin, policy, loading, saving, error, refresh, setVerification };
}
