import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  formatSftpFileSize,
  formatSftpModifiedTime,
  resolveSftpFileType
} from "../../composables/sftp/file-manager/filePresentation";
import { buildSftpTransferInputs, safeLocalDownloadName } from "../../composables/sftp/file-manager/selectors";
import { SFTP_ENTRY_NAME_MAX_LENGTH, sftpEntryNameError } from "../../composables/sftp/file-manager/sftpEntryName";
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
import { useBrowserDownloadTransferEndpoint } from "../../composables/sftp/file-manager/useBrowserDownloadTransferEndpoint";
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

describe("sftp entry name length", () => {
  it("accepts 255 characters and rejects 256 without treating empty as an error", () => {
    const tooLong = "too long";
    expect(sftpEntryNameError("", tooLong)).toBe("");
    expect(sftpEntryNameError("a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH), tooLong)).toBe("");
    expect(sftpEntryNameError(`  ${"a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH)}  `, tooLong)).toBe("");
    expect(sftpEntryNameError("a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH + 1), tooLong)).toBe(tooLong);
  });
});

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

describe("desktop download names", () => {
  it("keeps remote names inside the local downloads directory", () => {
    expect(safeLocalDownloadName("..\\Startup\\payload.cmd")).toBe(".._Startup_payload.cmd");
    expect(safeLocalDownloadName("CON.txt")).toBe("_CON.txt");
    expect(safeLocalDownloadName("report. ")).toBe("report_");
  });
});

describe("browser upload transfer endpoint", () => {
  it("stages browser File objects as a transfer-center source only", async () => {
    const endpoint = useBrowserUploadTransferEndpoint({ label: "Web Upload" });
    expect(endpoint.ref.id).toBe(WEB_UPLOAD_ENDPOINT_ID);
    const staged = endpoint.stageFiles([new File(["hello"], "hello.txt", { type: "text/plain" })]);
    expect(staged.entries).toEqual([{ name: "hello.txt", size: "5" }]);
    expect(staged.sourcePath).toMatch(/^\/web-upload\/[^/]+$/);
    const chunk = await endpoint.readChunk({
      transferId: "t1",
      path: `${staged.sourcePath}/hello.txt`,
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

  it("keeps same-name files from later stageFiles batches independently readable", async () => {
    const endpoint = useBrowserUploadTransferEndpoint({ id: "web-upload:compact", label: "Compact Upload" });
    expect(endpoint.ref.id).toBe("web-upload:compact");
    const first = endpoint.stageFiles([new File(["one"], "same.txt", { type: "text/plain" })]);
    const second = endpoint.stageFiles([new File(["two-two"], "same.txt", { type: "text/plain" })]);
    expect(first.sourcePath).not.toBe(second.sourcePath);
    const firstChunk = await endpoint.readChunk({
      transferId: "t1",
      path: `${first.sourcePath}/same.txt`,
      offset: 0,
      length: 8
    });
    const secondChunk = await endpoint.readChunk({
      transferId: "t2",
      path: `${second.sourcePath}/same.txt`,
      offset: 0,
      length: 8
    });
    expect(new TextDecoder().decode(firstChunk.data)).toBe("one");
    expect(new TextDecoder().decode(secondChunk.data)).toBe("two-two");
  });
});

describe("browser download transfer endpoint", () => {
  it("buffers transfer chunks and starts a browser download on commit", async () => {
    const endpoint = useBrowserDownloadTransferEndpoint({ label: "Download" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await endpoint.prepareTransfer({
      transferId: "download-1",
      targetPath: "/hello.txt",
      fileName: "hello.txt",
      size: 5,
      conflictPolicy: "ask"
    });
    await endpoint.writeChunk({
      transferId: "download-1",
      targetPath: "/hello.txt",
      totalBytes: 5,
      offset: 0,
      data: new TextEncoder().encode("hello"),
      sha256: "unused"
    });
    await endpoint.commitTransfer({
      transferId: "download-1",
      targetPath: "/hello.txt",
      totalBytes: 5,
      sha256: "unused",
      conflictPolicy: "ask"
    });

    expect(click).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test");
    await expect(
      endpoint.getTransferStatus({ transferId: "download-1", targetPath: "/hello.txt", totalBytes: 5 })
    ).resolves.toMatchObject({ state: "missing", committedBytes: 0 });
    click.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("discards buffered bytes when a failed task is cleared", async () => {
    const endpoint = useBrowserDownloadTransferEndpoint({ label: "Download" });
    await endpoint.prepareTransfer({
      transferId: "failed-download",
      targetPath: "/failed.bin",
      fileName: "failed.bin",
      size: 1024,
      conflictPolicy: "ask"
    });
    await endpoint.cancelTransfer({ transferId: "failed-download", targetPath: "/failed.bin", discard: true });
    await expect(
      endpoint.getTransferStatus({ transferId: "failed-download", targetPath: "/failed.bin", totalBytes: 1024 })
    ).resolves.toMatchObject({ state: "missing", committedBytes: 0 });
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
    expect(formatSftpFileSize("1000")).toBe("1000 B");
    expect(formatSftpFileSize("1024")).toBe("1 KB");
    expect(formatSftpFileSize("1048576")).toBe("1 MB");
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
