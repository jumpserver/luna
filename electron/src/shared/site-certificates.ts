import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { session } from "electron";
import type { Certificate, Session } from "electron";
import { inspectSiteCertificate } from "./certificate-inspection";
import type { CertificateInspection } from "./certificate-inspection";
import { toFetchUrl } from "./url";

export function certificateSiteOrigin(site: string): string {
  const url = new URL(site);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error("Invalid certificate policy site");
  return url.origin;
}

interface SiteNetwork {
  session: Session;
  retired: boolean;
}

interface SiteCertificatePolicy {
  origin: string;
  verifyCertificate: boolean;
  certificateVerified: boolean | null;
}

export class SiteCertificateService {
  private disabled = new Set<string>();
  private httpAcknowledged = new Set<string>();
  private networks = new Map<string, SiteNetwork>();
  private certificates = new Map<string, ReturnType<SiteCertificateService["describeCertificate"]>>();
  private inspections = new Map<string, symbol>();
  private changing: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly onCertificateChanged?: (policy: SiteCertificatePolicy) => void
  ) {}

  async initialize() {
    try {
      const saved = JSON.parse(await readFile(this.filePath, "utf8"));
      for (const [values, protocol, target] of [
        [saved.disabledOrigins, "https:", this.disabled],
        [saved.httpAcknowledgedOrigins, "http:", this.httpAcknowledged]
      ] as const) {
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          try {
            if (
              typeof value === "string" &&
              new URL(value).protocol === protocol &&
              certificateSiteOrigin(value) === value
            )
              target.add(value);
          } catch {
            // Invalid persisted entries never disable verification.
          }
        }
      }
    } catch {
      // Missing or invalid settings start with strict verification.
    }
  }

  policy(site: string): SiteCertificatePolicy {
    const origin = certificateSiteOrigin(site);
    const certificate = this.certificates.get(origin);
    const now = Date.now() / 1000;
    const certificateVerified = certificate
      ? certificate.error === "OK" && certificate.validStart <= now && now <= certificate.validExpiry
      : null;
    return { origin, verifyCertificate: !this.disabled.has(origin), certificateVerified };
  }

  private async persist(disabled = this.disabled, httpAcknowledged = this.httpAcknowledged) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({
        disabledOrigins: [...disabled],
        httpAcknowledgedOrigins: [...httpAcknowledged]
      }),
      { mode: 0o600 }
    );
    await rename(temporary, this.filePath);
  }

  private change<T>(work: () => Promise<T>): Promise<T> {
    const result = this.changing.then(work);
    this.changing = result.catch(() => {});
    return result;
  }

  setVerification(site: string, enabled: boolean) {
    const origin = certificateSiteOrigin(site);
    if (typeof enabled !== "boolean" || !origin.startsWith("https://"))
      throw new Error("Certificate verification applies to HTTPS sites only");
    return this.change(async () => {
      const previous = this.policy(origin).verifyCertificate;
      if (previous === enabled) return this.policy(origin);
      const disabled = new Set(this.disabled);
      if (enabled) disabled.delete(origin);
      else disabled.add(origin);
      await this.persist(disabled);
      this.disabled = disabled;
      // A new policy/session must obtain a fresh verification result before showing a trusted connection.
      this.certificates.delete(origin);
      const old = this.networks.get(origin);
      if (old) {
        old.retired = true;
        this.networks.delete(origin);
        await old.session.closeAllConnections();
        // Preserve connector authentication/language cookies while discarding
        // only the old transport and its certificate-verification cache.
        const replacement = this.network(origin).session;
        for (const cookie of await old.session.cookies.get({})) {
          await replacement.cookies.set({
            url: `${origin}${cookie.path}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.hostOnly ? undefined : cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate,
            sameSite: cookie.sameSite
          });
        }
      }
      // Chromium caches verifier overrides. Never reuse an API Session across
      // policy changes. Renderer exceptions are URL-scoped certificate-error decisions.
      if (enabled) await session.defaultSession.closeAllConnections();
      return this.policy(origin);
    });
  }

  needsHttpConfirmation(site: string) {
    const origin = certificateSiteOrigin(site);
    return origin.startsWith("http://") && !this.httpAcknowledged.has(origin);
  }

  acknowledgeHttp(site: string) {
    const origin = certificateSiteOrigin(site);
    if (!origin.startsWith("http://")) throw new Error("Expected an HTTP site");
    return this.change(async () => {
      const acknowledged = new Set(this.httpAcknowledged).add(origin);
      await this.persist(this.disabled, acknowledged);
      this.httpAcknowledged = acknowledged;
    });
  }

  private network(origin: string): SiteNetwork {
    let network = this.networks.get(origin);
    if (network) return network;
    const name = createHash("sha256").update(origin).digest("hex");
    network = { session: session.fromPartition(`site-api:${name}:${randomUUID()}`), retired: false };
    const current = network;
    const skipVerification = this.disabled.has(origin);
    current.session.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try {
        allowed = !current.retired && certificateSiteOrigin(details.url) === origin;
      } catch {
        /* A site network never follows external or non-HTTP redirects. */
      }
      callback({ cancel: !allowed });
    });
    current.session.setCertificateVerifyProc((request, callback) => {
      if (!current.retired) this.rememberCertificate(origin, request.certificate, request.verificationResult);
      const hostname = (value: string) => value.replace(/^\[|\]$/g, "").toLowerCase();
      callback(
        current.retired
          ? -2
          : skipVerification && hostname(request.hostname) === hostname(new URL(origin).hostname)
            ? 0
            : -3
      );
    });
    this.networks.set(origin, current);
    return current;
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    await this.changing;
    const origin = certificateSiteOrigin(toFetchUrl(input));
    const network = this.network(origin);
    let response: Response;
    try {
      response = await network.session.fetch(input instanceof URL ? input.toString() : input, init);
    } catch (cause) {
      if (!network.retired && String(cause).includes("ERR_BLOCKED_BY_CLIENT")) {
        throw Object.assign(new Error("Cross-site redirect blocked; connect using the final site address", { cause }), {
          code: "ERR_CROSS_ORIGIN_REDIRECT"
        });
      }
      throw cause;
    }
    if (network.retired) {
      await response.body?.cancel();
      throw new Error("Site certificate policy changed during request");
    }
    return response;
  }

  async cookiesForUrl(url: string) {
    await this.changing;
    return this.network(certificateSiteOrigin(url)).session.cookies.get({ url });
  }

  rendererCertificateAllowed(url: string) {
    try {
      const target = new URL(url);
      if (target.protocol === "wss:") target.protocol = "https:";
      return target.protocol === "https:" && this.disabled.has(certificateSiteOrigin(target.toString()));
    } catch {
      return false;
    }
  }

  private describeCertificate(origin: string, certificate: CertificateInspection["certificate"], error: string) {
    const parsed = new X509Certificate(certificate.data);
    const publicKey = parsed.publicKey;
    const publicKeyDetails = publicKey.asymmetricKeyDetails;
    return {
      origin,
      subjectName: certificate.subjectName,
      subject: parsed.subject,
      issuerName: certificate.issuerName,
      issuer: parsed.issuer,
      serialNumber: parsed.serialNumber,
      validStart: certificate.validStart,
      validExpiry: certificate.validExpiry,
      fingerprint: parsed.fingerprint256,
      fingerprintSha1: parsed.fingerprint,
      domains: parsed.subjectAltName || "",
      publicKeyAlgorithm: publicKey.asymmetricKeyType || "",
      publicKeyBits: publicKeyDetails?.modulusLength,
      publicKeyCurve: publicKeyDetails?.namedCurve,
      raw: parsed.toString(),
      error: error === "net::OK" ? "OK" : error
    };
  }

  rememberCertificate(site: string, certificate: Certificate, error: string) {
    try {
      const url = new URL(site);
      if (url.protocol === "wss:") url.protocol = "https:";
      const origin = certificateSiteOrigin(url.toString());
      const previous = this.policy(origin).certificateVerified;
      this.certificates.set(origin, this.describeCertificate(origin, certificate, error));
      const policy = this.policy(origin);
      if (policy.certificateVerified !== previous) this.onCertificateChanged?.(policy);
    } catch {
      /* Malformed certificate details must not change the trust decision. */
    }
  }

  async certificateInfo(site: string) {
    const origin = certificateSiteOrigin(site);
    if (!origin.startsWith("https://")) return null;
    const inspection = Symbol("certificate-inspection");
    this.inspections.set(origin, inspection);
    let certificate: ReturnType<SiteCertificateService["describeCertificate"]> | null = null;
    try {
      const result = await inspectSiteCertificate(origin);
      if (result) certificate = this.describeCertificate(origin, result.certificate, result.error);
    } catch {
      // A failed inspection must not present an earlier certificate as current.
    }
    if (this.inspections.get(origin) === inspection) {
      this.inspections.delete(origin);
      const previous = this.policy(origin).certificateVerified;
      if (certificate) this.certificates.set(origin, certificate);
      else this.certificates.delete(origin);
      const policy = this.policy(origin);
      if (policy.certificateVerified !== previous) this.onCertificateChanged?.(policy);
    }
    return certificate;
  }
}
