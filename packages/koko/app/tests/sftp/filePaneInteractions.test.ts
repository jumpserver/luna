import { describe, expect, it } from "vitest";
import { ref } from "vue";
import {
  buildTransferSourcePayload,
  createMockDataTransfer,
  hasEndpointPrefix,
  hasTransferMimeType,
  isCrossEndpointTransferDrag,
  parseTransferDragPayload,
  transferEntriesFromSelection,
  writeTransferDragData
} from "../../composables/sftp/file-manager/transfer";
import { useSftpPaneSelection } from "../../composables/sftp/file-manager/useSftpPaneSelection";

const entries = [
  { name: "..", is_dir: true, size: "" },
  { name: "alpha.txt", is_dir: false, size: "10" },
  { name: "beta.txt", is_dir: false, size: "20" },
  { name: "gamma", is_dir: true, size: "" },
  { name: "delta.txt", is_dir: false, size: "30" }
];

describe("file pane selection composable", () => {
  it("supports single, range, toggle, and select-all selection with revision tracking", () => {
    const selection = useSftpPaneSelection({ visibleEntries: ref(entries) });

    selection.selectEntry(entries[1]!);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt"]);
    expect(selection.selectionRevision.value).toBe(1);

    selection.selectEntry(entries[3]!, { shiftKey: true } as MouseEvent);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt", "beta.txt", "gamma"]);
    expect(selection.selectionRevision.value).toBe(2);

    selection.selectEntry(entries[2]!, { metaKey: true } as MouseEvent);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt", "gamma"]);
    expect(selection.selectionRevision.value).toBe(3);

    selection.toggleAllVisible(true);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual([
      "alpha.txt",
      "beta.txt",
      "gamma",
      "delta.txt"
    ]);
    expect(selection.selectAllState.value).toBe(true);
    expect(selection.selectionRevision.value).toBe(4);
  });

  it("supports arrow, boundary, and shift-extended keyboard navigation", () => {
    const selection = useSftpPaneSelection({ visibleEntries: ref(entries) });

    selection.moveSelection(1);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt"]);

    selection.moveSelection(1, true);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt", "beta.txt"]);

    selection.moveSelectionToBoundary("end", true);
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual([
      "alpha.txt",
      "beta.txt",
      "gamma",
      "delta.txt"
    ]);

    selection.moveSelectionToBoundary("start");
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt"]);
  });

  it("only clears transferred entries when path and revision still match", () => {
    const selection = useSftpPaneSelection({ visibleEntries: ref(entries) });
    selection.updateSelection([entries[1]!, entries[2]!]);
    const revision = selection.selectionRevision.value;

    selection.clearTransferredSelection(["alpha.txt"], "/tmp/other", revision, "/tmp/current");
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt", "beta.txt"]);

    selection.clearTransferredSelection(["alpha.txt"], "/tmp/current", revision + 1, "/tmp/current");
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["alpha.txt", "beta.txt"]);

    selection.clearTransferredSelection(["alpha.txt"], "/tmp/current", revision, "/tmp/current");
    expect(selection.selectedEntries.value.map((entry) => entry.name)).toEqual(["beta.txt"]);
  });
});

describe("file pane transfer helpers", () => {
  it("filters transferable file entries and handles nullable endpoint prefixes safely", () => {
    expect(transferEntriesFromSelection(entries)).toEqual([
      { name: "alpha.txt", size: "10" },
      { name: "beta.txt", size: "20" },
      { name: "delta.txt", size: "30" }
    ]);
    expect(hasEndpointPrefix(null, "sftp:")).toBe(false);
    expect(hasEndpointPrefix("local:fs", "sftp:")).toBe(false);
    expect(hasEndpointPrefix("sftp:asset-1", "sftp:")).toBe(true);
    expect(isCrossEndpointTransferDrag("sftp:asset-1", "local:fs")).toBe(true);
    expect(isCrossEndpointTransferDrag("local:fs", "local:fs")).toBe(false);
  });

  it("serializes and validates drag payloads across endpoints", () => {
    const activeSourceId = ref<string | null>(null);
    const payload = buildTransferSourcePayload({
      sourceEndpoint: { id: "sftp:asset-1", label: "Asset 1" },
      sourcePath: "/srv/data",
      sourceSelectionRevision: 7,
      entries: [{ name: "alpha.txt", size: "10" }]
    });

    expect(payload).not.toBeNull();

    const dataTransfer = createMockDataTransfer();
    writeTransferDragData({ dataTransfer } as DragEvent, payload!, activeSourceId);

    expect(activeSourceId.value).toBe("sftp:asset-1");
    expect(hasTransferMimeType({ dataTransfer } as DragEvent)).toBe(true);
    expect(parseTransferDragPayload({ dataTransfer } as DragEvent, "local:fs")).toEqual(payload);
    expect(parseTransferDragPayload({ dataTransfer } as DragEvent, "sftp:asset-1")).toBeNull();
  });
});
