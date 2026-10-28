import { createHash, randomUUID } from "node:crypto";

export interface ClipboardHistoryItem {
  id: string;
  text: string;
  copiedAt: number;
}

const MAX_ITEMS = 100;
const MAX_ITEM_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const POLL_INTERVAL = 500;

export class ClipboardHistoryService {
  private items: Array<ClipboardHistoryItem & { bytes: number }> = [];
  private totalBytes = 0;
  private lastFingerprint = "";
  private enabled = true;
  private running = false;
  private revision = 0;
  private pending: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly readText: () => Promise<string>) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.poll();
  }

  stop() {
    this.running = false;
    this.revision++;
    this.cancelTimer();
  }

  status() {
    return { enabled: this.enabled };
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.revision++;
    this.cancelTimer();
    if (enabled && this.running) void this.poll();
  }

  async read(): Promise<ClipboardHistoryItem[]> {
    await this.capture();
    return this.items.map(({ id, text, copiedAt }) => ({ id, text, copiedAt }));
  }

  remove(id: string) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    this.totalBytes -= this.items[index].bytes;
    this.items.splice(index, 1);
  }

  async clear() {
    await this.capture();
    this.items = [];
    this.totalBytes = 0;
    // Keep only the fingerprint so unchanged clipboard text is not immediately restored.
  }

  capture() {
    if (!this.running || !this.enabled) return Promise.resolve();
    if (!this.pending) {
      this.pending = this.captureText(this.revision).finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  private async captureText(revision: number) {
    try {
      const text = await this.readText();
      if (!this.running || !this.enabled || revision !== this.revision) return;
      if (!text || text.length > MAX_ITEM_BYTES || Buffer.byteLength(text, "utf8") > MAX_ITEM_BYTES) {
        this.lastFingerprint = "";
        return;
      }
      const fingerprint = createHash("sha256").update(text).digest("hex");
      if (fingerprint === this.lastFingerprint) return;
      this.lastFingerprint = fingerprint;
      const previous = this.items.find((item) => item.text === text);
      if (previous) this.remove(previous.id);
      const bytes = Buffer.byteLength(text, "utf8");
      this.items.unshift({ id: previous?.id || randomUUID(), text, copiedAt: Date.now(), bytes });
      this.totalBytes += bytes;
      while (this.items.length > MAX_ITEMS || this.totalBytes > MAX_TOTAL_BYTES) {
        this.totalBytes -= this.items.pop()!.bytes;
      }
    } catch {
      // Clipboard access may temporarily fail. Retry without logging sensitive contents.
    }
  }

  private async poll() {
    if (!this.running || !this.enabled) return;
    const revision = this.revision;
    await this.capture();
    if (!this.running || !this.enabled || revision !== this.revision) return;
    // Schedule after capture completes, with at most one native clipboard read in flight.
    this.timer = setTimeout(() => void this.poll(), POLL_INTERVAL);
    this.timer.unref?.();
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
