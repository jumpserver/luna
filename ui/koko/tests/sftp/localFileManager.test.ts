import { beforeEach, describe, expect, it, vi } from "vitest";

const localFiles = {
  isAvailable: vi.fn(() => true),
  homeDir: vi.fn(async () => "/Users/op"),
  desktopDir: vi.fn(async () => "/Users/op/Desktop"),
  downloadDir: vi.fn(async () => "/Users/op/Downloads"),
  join: vi.fn(async (left: string, right: string) => `${left.replace(/\/$/, "")}/${right}`),
  dirname: vi.fn(async (path: string) => path.replace(/\/[^/]+$/, "") || "/"),
  readDir: vi.fn(async () => [{ name: "notes.txt", isDirectory: false }]),
  stat: vi.fn(async () => ({
    isFile: true,
    isDirectory: false,
    size: 4,
    mtime: new Date("2026-08-17T08:00:00Z")
  })),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  startAccessingSecurityScopedResource: vi.fn(async () => undefined),
  stopAccessingSecurityScopedResource: vi.fn(async () => undefined),
  chooseFolder: vi.fn(async () => null),
  revealItemInDir: vi.fn(async () => undefined)
};

vi.mock("#koko/host", () => ({
  useKokoHostAdapter: () => ({ localFiles })
}));

const { useLocalFileManager } = await import("#koko/composables/sftp/file-manager/useLocalFileManager");

describe("local file manager", () => {
  beforeEach(() => {
    for (const value of Object.values(localFiles)) value.mockClear();
    localFiles.isAvailable.mockReturnValue(true);
    localFiles.homeDir.mockResolvedValue("/Users/op");
    localFiles.readDir.mockResolvedValue([{ name: "notes.txt", isDirectory: false }]);
    localFiles.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 4,
      mtime: new Date("2026-08-17T08:00:00Z")
    });
  });

  it("lists the home directory and renames a file through the host adapter", async () => {
    const manager = useLocalFileManager({ translate: (key) => key });
    await manager.list();

    expect(manager.currentPath.value).toBe("/Users/op");
    expect(manager.entries.value.map((entry) => entry.name)).toEqual(["notes.txt"]);
    expect(localFiles.readDir).toHaveBeenCalledWith("/Users/op");

    localFiles.readDir.mockResolvedValue([{ name: "hello.txt", isDirectory: false }]);
    await manager.renameEntry(manager.entries.value[0]!, "hello.txt");

    expect(localFiles.rename).toHaveBeenCalledWith("/Users/op/notes.txt", "/Users/op/hello.txt");
    expect(manager.entries.value.map((entry) => entry.name)).toEqual(["hello.txt"]);
  });
});
