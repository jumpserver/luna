import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { joinSftpPath } from "../../composables/sftp/core/codec";
import {
  formatSftpFileSize,
  formatSftpModifiedTime,
  resolveSftpFileType
} from "../../composables/sftp/file-manager/filePresentation";
import { buildSftpTransferInputs, safeLocalDownloadName } from "../../composables/sftp/file-manager/selectors";
import { SFTP_ENTRY_NAME_MAX_LENGTH, sftpEntryNameError } from "../../composables/sftp/file-manager/sftpEntryName";
import {
  buildTransferSourcePayload,
  collectBrowserUploadSelection,
  createMockDataTransfer,
  expandTransferSelection,
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
import {
  joinLocalFsPath,
  resolveLocalFsDestinationPath
} from "../../composables/sftp/file-manager/useLocalFileTransferEndpoint";
import { useSftpPaneSelection } from "../../composables/sftp/file-manager/useSftpPaneSelection";
import { isSftpHiddenEntryName } from "../../composables/sftp/file-manager/useSftpShowHiddenFiles";
import { resolveSftpFileExtension, resolveSftpFileIcon } from "../../composables/sftp/useSftpFileIcon";

const entries = [
  { name: "..", is_dir: true, size: "" },
  { name: "alpha.txt", is_dir: false, size: "10" },
  { name: "beta.txt", is_dir: false, size: "20" },
  { name: "gamma", is_dir: true, size: "" },
  { name: "delta.txt", is_dir: false, size: "30" }
];

describe("sftp hidden entries", () => {
  it("treats dotfiles as hidden except parent directory", () => {
    expect(isSftpHiddenEntryName(".env")).toBe(true);
    expect(isSftpHiddenEntryName("..")).toBe(false);
    expect(isSftpHiddenEntryName("release.txt")).toBe(false);
  });
});

describe("sftp entry name length", () => {
  it("accepts 255 characters and rejects 256 without treating empty as an error", () => {
    const tooLong = "too long";
    expect(sftpEntryNameError("", tooLong)).toBe("");
    expect(sftpEntryNameError("a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH), tooLong)).toBe("");
    expect(sftpEntryNameError(`  ${"a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH)}  `, tooLong)).toBe("");
    expect(sftpEntryNameError("a".repeat(SFTP_ENTRY_NAME_MAX_LENGTH + 1), tooLong)).toBe(tooLong);
  });

  it("rejects path separators and Windows-illegal filename characters", () => {
    const invalid = "invalid name";
    expect(sftpEntryNameError('a/b\\c:d*e?f"g<h>i|j.txt', "too long", invalid)).toBe(invalid);
    expect(sftpEntryNameError(".", "too long", invalid)).toBe(invalid);
    expect(sftpEntryNameError("notes.txt", "too long", invalid)).toBe("");
  });

  it("does not treat a slash in the entry name as nested directories", () => {
    expect(joinSftpPath("/home", "notes")).toBe("/home/notes");
    expect(() => joinSftpPath("/home", "a/b")).toThrow("sftp_invalid_name");
  });
});

describe("local transfer path joining", () => {
  it("never uses unix root as a local fs destination", () => {
    expect(resolveLocalFsDestinationPath("C:\\Users\\demo", "C:\\Users\\demo")).toBe("C:\\Users\\demo");
    expect(resolveLocalFsDestinationPath("", "C:\\Users\\demo")).toBe("C:\\Users\\demo");
    expect(resolveLocalFsDestinationPath("/", "C:\\Users\\demo")).toBe("C:\\Users\\demo");
    expect(resolveLocalFsDestinationPath("/home/demo", "/home/demo")).toBe("/home/demo");
    expect(resolveLocalFsDestinationPath("", "/")).toBe("");
  });

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

    const nested = buildSftpTransferInputs(
      {
        sourceEndpoint: { id: "local:fs", label: "Local" },
        sourcePath: "C:\\Users\\demo",
        sourceSelectionRevision: 1,
        entries: [{ name: "notes.txt", size: "12", relativeDir: "folder/child" }],
        destinationPath: "/tmp"
      },
      { id: "sftp:token", label: "Remote" }
    )[0];
    expect(nested?.source.path).toBe("C:\\Users\\demo\\folder\\child\\notes.txt");
    expect(nested?.destinationPath).toBe("/tmp/folder/child");
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

  it("stages relative file paths and empty directories without flattening", async () => {
    const endpoint = useBrowserUploadTransferEndpoint({ label: "Web Upload" });
    const file = new File(["nested"], "hello.txt");
    const staged = endpoint.stageFiles([
      { file, relativePath: "folder/child/hello.txt", is_dir: false },
      { relativePath: "folder/empty", is_dir: true }
    ]);

    expect(staged.entries).toEqual([
      { name: "folder", size: "", is_dir: true },
      { name: "child", size: "", is_dir: true, relativeDir: "folder" },
      { name: "empty", size: "", is_dir: true, relativeDir: "folder" },
      { name: "hello.txt", size: "6", relativeDir: "folder/child" }
    ]);
    await expect(
      endpoint.readChunk({
        transferId: "nested",
        path: `${staged.sourcePath}/folder/child/hello.txt`,
        offset: 0,
        length: 6
      })
    ).resolves.toMatchObject({ eof: true });
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
      data: new TextEncoder().encode("he"),
      sha256: "unused"
    });
    await endpoint.writeChunk({
      transferId: "download-1",
      targetPath: "/hello.txt",
      totalBytes: 5,
      offset: 2,
      data: new TextEncoder().encode("llo"),
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
    expect(createObjectUrl.mock.calls[0]?.[0]).toMatchObject({ size: 5 });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test");
    await expect(
      endpoint.getTransferStatus({ transferId: "download-1", targetPath: "/hello.txt", totalBytes: 5 })
    ).resolves.toMatchObject({ state: "missing", committedBytes: 0 });
    click.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("prepares multi-gigabyte downloads without allocating the whole file", async () => {
    const endpoint = useBrowserDownloadTransferEndpoint({ label: "Download" });
    const size = 3 * 1024 * 1024 * 1024;
    await expect(
      endpoint.prepareTransfer({
        transferId: "huge-download",
        targetPath: "/huge.bin",
        fileName: "huge.bin",
        size,
        conflictPolicy: "ask"
      })
    ).resolves.toMatchObject({ state: "ready", committedBytes: 0, totalBytes: size });
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
  it("keeps selected folders and browser relative paths", async () => {
    expect(transferEntriesFromSelection(entries)).toEqual([
      { name: "alpha.txt", size: "10" },
      { name: "beta.txt", size: "20" },
      { name: "gamma", size: "", is_dir: true },
      { name: "delta.txt", size: "30" }
    ]);

    const nestedFile = new File(["hello"], "hello.txt", { type: "text/plain" });
    Object.defineProperty(nestedFile, "webkitRelativePath", { value: "folder/hello.txt" });
    await expect(collectBrowserUploadSelection([nestedFile])).resolves.toEqual({
      items: [{ file: nestedFile, relativePath: "folder/hello.txt", is_dir: false }],
      failures: []
    });
  });

  it("walks real webkitGetAsEntry directory trees, nests subdirectories, and caps depth per subtree", async () => {
    function mockFileEntry(name: string, file: File): FileSystemEntry {
      return {
        name,
        isFile: true,
        isDirectory: false,
        file: (success: (file: File) => void) => success(file)
      } as unknown as FileSystemEntry;
    }
    function mockDirEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
      let delivered = false;
      return {
        name,
        isFile: false,
        isDirectory: true,
        createReader: () => ({
          readEntries: (success: (entries: FileSystemEntry[]) => void) => {
            success(delivered ? [] : children);
            delivered = true;
          }
        })
      } as unknown as FileSystemEntry;
    }
    function mockDataTransferItem(entry: FileSystemEntry): DataTransferItem {
      return { webkitGetAsEntry: () => entry } as unknown as DataTransferItem;
    }

    const fileA = new File(["a"], "a.txt", { type: "text/plain" });
    const tooDeep = new File(["c"], "toodeep.txt", { type: "text/plain" });

    const keepRoot = mockDirEntry("keep", [mockFileEntry("a.txt", fileA)]);
    const deepRoot = mockDirEntry("deep", [mockDirEntry("nested", [mockFileEntry("toodeep.txt", tooDeep)])]);

    const selection = await collectBrowserUploadSelection(
      [],
      [mockDataTransferItem(keepRoot), mockDataTransferItem(deepRoot)],
      2
    );

    expect(selection.items).toEqual([
      { relativePath: "keep", is_dir: true },
      { file: fileA, relativePath: "keep/a.txt", is_dir: false },
      { relativePath: "deep", is_dir: true },
      { relativePath: "deep/nested", is_dir: true }
    ]);
    expect(selection.failures).toHaveLength(1);
  });

  it("expands nested folders, preserves empty directories, skips parent entries, and caps depth", async () => {
    const tree = new Map([
      [
        "/srv/data/docs",
        [
          { name: "nested", size: "", is_dir: true },
          { name: "root.txt", size: "2", is_dir: false }
        ]
      ],
      [
        "/srv/data/docs/nested",
        [
          { name: "..", size: "", is_dir: true },
          { name: "deep.txt", size: "3", is_dir: false }
        ]
      ],
      ["/srv/data/empty", []]
    ]);
    const payload = buildTransferSourcePayload({
      sourceEndpoint: { id: "sftp:source", label: "Source" },
      sourcePath: "/srv/data",
      sourceSelectionRevision: 1,
      entries: [
        { name: "docs", size: "", is_dir: true },
        { name: "empty", size: "", is_dir: true }
      ]
    })!;
    const expanded = await expandTransferSelection(payload, async (path) => tree.get(path) || []);

    expect(expanded.entries).toEqual([
      { name: "deep.txt", size: "3", relativeDir: "docs/nested" },
      { name: "root.txt", size: "2", relativeDir: "docs" }
    ]);
    expect(expanded.directories).toEqual(["docs", "docs/nested", "empty"]);
    expect(expanded.failures).toEqual([]);

    const capped = await expandTransferSelection(
      { ...payload, entries: [{ name: "docs", size: "", is_dir: true }] },
      async () => [{ name: "child", size: "", is_dir: true }],
      1
    );
    expect(capped.directories).toEqual(["docs"]);
    expect(capped.failures).toHaveLength(1);
  });

  it("rejects backslash-and-dot-dot child names during folder expansion instead of traversing out", async () => {
    const tree = new Map([
      [
        "/srv/data/docs",
        [
          { name: "evil\\..\\..\\Startup\\bad.exe", size: "5", is_dir: false },
          { name: "root.txt", size: "2", is_dir: false }
        ]
      ]
    ]);
    const payload = buildTransferSourcePayload({
      sourceEndpoint: { id: "sftp:source", label: "Source" },
      sourcePath: "/srv/data",
      sourceSelectionRevision: 1,
      entries: [{ name: "docs", size: "", is_dir: true }]
    })!;
    const expanded = await expandTransferSelection(payload, async (path) => tree.get(path) || []);

    expect(expanded.entries).toEqual([{ name: "root.txt", size: "2", relativeDir: "docs" }]);
    expect(expanded.directories).toEqual(["docs"]);
    expect(expanded.failures).toEqual([]);
  });

  it("keeps files from sibling folders when one directory cannot be listed", async () => {
    const payload = buildTransferSourcePayload({
      sourceEndpoint: { id: "sftp:source", label: "Source" },
      sourcePath: "/srv/data",
      sourceSelectionRevision: 1,
      entries: [
        { name: "denied", size: "", is_dir: true },
        { name: "readable", size: "", is_dir: true }
      ]
    })!;
    const expanded = await expandTransferSelection(payload, async (path) => {
      if (path.endsWith("/denied")) throw new Error("permission denied");
      return [{ name: "kept.txt", size: "4", is_dir: false }];
    });

    expect(expanded.entries).toEqual([{ name: "kept.txt", size: "4", relativeDir: "readable" }]);
    expect(expanded.directories).toEqual(["readable"]);
    expect(expanded.failures).toHaveLength(1);
  });

  it("handles nullable endpoint prefixes safely", () => {
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
