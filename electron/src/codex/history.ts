import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";
import type { AgentEvent, AgentHistoryResponse } from "../../../ui/koko/composables/agent/types";

const histories = new Set<CodexEventHistory>();
process.once("exit", () => {
  for (const history of histories) history.close();
});
const PAGE_BYTES = 512 * 1024;

/** Session-scoped replay storage; eviction affects only the recent memory cache. */
export class CodexEventHistory {
  private directory: string;
  private database?: DatabaseSync;
  private insert: StatementSync;
  private position: StatementSync;
  private lastInPage: StatementSync;
  private page: StatementSync;
  private recent: Array<{ event: AgentEvent; bytes: number } | undefined> = [];
  private start = 0;
  private bytes = 0;
  private totalBytes = 0;
  private sequence = 0;

  constructor(
    private readonly capacityBytes = 4 * 1024 * 1024,
    root = tmpdir()
  ) {
    this.directory = mkdtempSync(path.join(root, "jumpserver-local-ai-history-"));
    try {
      const file = path.join(this.directory, "events.sqlite");
      this.database = new DatabaseSync(file);
      chmodSync(file, 0o600);
      // This is a disposable replay spool, with bounded SQLite page memory and no recovery journal.
      this.database.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-1024;
        CREATE TABLE events (seq INTEGER PRIMARY KEY, end_bytes INTEGER NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX events_bytes ON events(end_bytes);`);
      this.insert = this.database.prepare("INSERT INTO events VALUES (?, ?, ?)");
      this.position = this.database.prepare("SELECT end_bytes FROM events WHERE seq = ?");
      this.lastInPage = this.database.prepare(
        "SELECT seq FROM events WHERE end_bytes <= ? ORDER BY end_bytes DESC LIMIT 1"
      );
      this.page = this.database.prepare("SELECT payload FROM events WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT 256");
      histories.add(this);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  append(event: AgentEvent, json: string) {
    if (!this.database) throw new Error("Local AI history is closed");
    const bytes = Buffer.byteLength(json);
    this.insert.run(event.seq, this.totalBytes + bytes, json);
    this.totalBytes += bytes;
    this.sequence = event.seq;
    this.recent.push({ event, bytes });
    this.bytes += bytes;
    while (this.bytes > this.capacityBytes && this.start < this.recent.length) {
      this.bytes -= this.recent[this.start]!.bytes;
      this.recent[this.start++] = undefined;
    }
    if (this.start > this.recent.length / 2) {
      this.recent = this.recent.slice(this.start);
      this.start = 0;
    }
  }

  read(after: number): AgentHistoryResponse {
    if (!this.database) throw new Error("Local AI history is closed");
    const first = this.recent[this.start];
    let events: AgentEvent[];
    if (first && after >= first.event.seq - 1) {
      events = [];
      let bytes = 0;
      for (let index = this.start; index < this.recent.length; index++) {
        const entry = this.recent[index]!;
        if (entry.event.seq <= after) continue;
        if (events.length >= 256 || (events.length && bytes + entry.bytes > PAGE_BYTES)) break;
        bytes += entry.bytes;
        events.push(entry.event);
      }
    } else {
      const position = Number(this.position.get(after)?.end_bytes || 0);
      const end = Math.max(after + 1, Number(this.lastInPage.get(position + PAGE_BYTES)?.seq || 0));
      events = this.page.all(after, end).map((row) => JSON.parse(String(row.payload)) as AgentEvent);
    }
    const cursor = events.at(-1)?.seq ?? after;
    return { events, next_cursor: cursor, has_more: cursor < this.sequence };
  }

  close() {
    this.database?.close();
    this.database = undefined;
    this.recent = [];
    this.bytes = 0;
    histories.delete(this);
    rmSync(this.directory, { recursive: true, force: true });
  }
}
