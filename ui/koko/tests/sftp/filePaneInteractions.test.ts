import { describe, expect, it } from "vitest";
import { ref } from "vue";
import {
  formatSftpFileSize,
  formatSftpModifiedTime,
  resolveSftpFileType
} from "../../composables/sftp/file-manager/filePresentation";
import { buildSftpTransferInputs } from "../../composables/sftp/file-manager/selectors";
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
import {
  useBrowserUploadTransferEndpoint,
  WEB_UPLOAD_ENDPOINT_ID
} from "../../composables/sftp/file-manager/useBrowserUploadTransferEndpoint";
import { joinLocalFsPath } from "../../composables/sftp/file-manager/useLocalFileTransferEndpoint";
import { useSftpPaneSelection } from "../../composables/sftp/file-manager/useSftpPaneSelection";
import { resolveSftpFileExtension, resolveSftpFileIcon } from "../../composables/sftp/useSftpFileIcon";

const entries = [
  { name: "..", is_dir: true, size: "" },
  { name: "alpha.txt", is_dir: false, size: "10" },
  { name: "beta.txt", is_dir: false, size: "20" },
  { name: "gamma", is_dir: true, size: "" },
  { name: "delta.txt", is_dir: false, size: "30" }
];

describe("local transfer path joining", () => {
  it("keeps windows separators for local sources used by transfer center", () => {
    expect(joinLocalFsPath("C:\\Users\\demo", "a.txt")).toBe("C:\\Users\\demo\\a.txt");
    expect(joinLocalFsPath("/home/demo", "a.txt")).toBe("/home/demo/a.txt");
    const inputs = buildSftpTransferInputs(
      {
        sourceEndpoint: { id: "local:fs", label: "Local" },
        sourcePath: "C:\\Users\\demo",
        sourceSelectionRevision: 1,
        entries: [{ name: "notes.txt", size: "12" }],
        destinationPath: "/tmp"
      },
      { id: "sftp:token", label: "Remote" }
    );
    expect(inputs[0]?.source.path).toBe("C:\\Users\\demo\\notes.txt");
  });
});

describe("browser upload transfer endpoint", () => {
  it("stages browser File objects as a transfer-center source only", async () => {
    const endpoint = useBrowserUploadTransferEndpoint({ label: "Web Upload" });
    expect(endpoint.ref.id).toBe(WEB_UPLOAD_ENDPOINT_ID);
    const staged = endpoint.stageFiles([new File(["hello"], "hello.txt", { type: "text/plain" })]);
    expect(staged.entries).toEqual([{ name: "hello.txt", size: "5" }]);
    const chunk = await endpoint.readChunk({
      transferId: "t1",
      path: "/web-upload/hello.txt",
      offset: 0,
      length: 5
    });
    expect(chunk.data.length).toBe(5);
    expect(chunk.eof).toBe(true);
    await expect(
      endpoint.prepareTransfer({
        transferId: "t1",
        targetPath: "/tmp/hello.txt",
        fileName: "hello.txt",
        size: 5,
        conflictPolicy: "ask"
      })
    ).rejects.toThrow(/cannot receive/);
  });
});

describe("sftp file icon mapping", () => {
  it("maps directories, archives, code, and fallbacks to lucide icons", () => {
    expect(resolveSftpFileIcon({ name: "..", is_dir: true })).toBe("i-lucide-folder-up");
    expect(resolveSftpFileIcon({ name: "docs", is_dir: true })).toBe("i-lucide-folder");
    expect(resolveSftpFileIcon({ name: "app.tar.gz", is_dir: false })).toBe("i-lucide-file-archive");
    expect(resolveSftpFileIcon({ name: "main.ts", is_dir: false })).toBe("i-lucide-braces");
    expect(resolveSftpFileIcon({ name: "photo.png", is_dir: false })).toBe("i-lucide-image");
    expect(resolveSftpFileIcon({ name: "notes.txt", is_dir: false })).toBe("i-lucide-file-text");
    expect(resolveSftpFileIcon({ name: "unknown", is_dir: false })).toBe("i-lucide-file");
    expect(resolveSftpFileIcon({ name: "weird.xyz", is_dir: false })).toBe("i-lucide-file");
    expect(resolveSftpFileExtension("archive.tar.gz")).toBe("tgz");
  });
});

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

describe("file pane presentation rules", () => {
  it("keeps file size, timestamp, extension, and server type formatting stable", () => {
    expect(formatSftpFileSize("1000")).toBe("1 kB");
    expect(formatSftpFileSize("")).toBe("0 B");
    expect(formatSftpModifiedTime("")).toBe("—");
    expect(formatSftpModifiedTime("not-a-date")).toBe("not-a-date");
    expect(
      resolveSftpFileType(
        { name: ".env", is_dir: false, size: "", perm: "", mod_time: "", type: "" },
        { folder: "Folder", file: "File" }
      )
    ).toBe("env");
    expect(
      resolveSftpFileType(
        { name: "README", is_dir: false, size: "", perm: "", mod_time: "", type: ".socket" },
        { folder: "Folder", file: "File" }
      )
    ).toBe("socket");
  });
});
