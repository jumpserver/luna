import type { FileTransferTask } from "@jumpserver/connectors-core";
import { describe, expect, it } from "vitest";
import {
  assetSupportsSftp,
  buildSftpTransferInputs,
  collidingTopLevelFolders,
  completedTransferSourceNames,
  defaultGlobalLeftPaneId,
  destRootFromTask,
  filterSftpDistributionTargets,
  isSftpDirectoryAffectedByTransfer,
  nextKeepBothFolderName,
  pathBelongsToFolder,
  rememberSftpConnection,
  rewriteFolderPrefix,
  transferFileBreadcrumbItems,
  transferFileDisplayPath,
  uniqueRemotePanesForSend
} from "#koko/composables/sftp/file-manager/selectors";

const sourceEndpoint = { id: "sftp:source", label: "Source" };
const destinationEndpoint = { id: "sftp:destination", label: "Destination" };

describe("sftp workspace selectors", () => {
  it("chooses the runtime-specific default pane for the global workspace", () => {
    expect(defaultGlobalLeftPaneId(true)).toBe("local");
    expect(defaultGlobalLeftPaneId(false)).toBe("web-upload");
  });

  it("requires an explicit SFTP protocol", () => {
    expect(assetSupportsSftp()).toBe(false);
    expect(assetSupportsSftp([])).toBe(false);
    expect(assetSupportsSftp([{ name: "SSH" }])).toBe(false);
    expect(assetSupportsSftp([{ name: "SSH" }, { name: " SFTP " }])).toBe(true);
    expect(assetSupportsSftp([{ name: { value: "sftp" } }])).toBe(true);
  });

  it("moves a recent connection to the front without duplicating the asset", () => {
    const previous = [
      { assetId: "one", assetName: "One", lastConnectedAt: 1 },
      { assetId: "two", assetName: "Two", lastConnectedAt: 2 }
    ];
    const current = { assetId: "one", assetName: "One updated", lastConnectedAt: 3 };

    expect(rememberSftpConnection(previous, current)).toEqual([current, previous[1]]);
  });

  it("filters distribution targets across organization, asset, and endpoint labels", () => {
    const targets = [
      {
        id: "one",
        endpoint: { id: "sftp:one", label: "Production" },
        organizationName: "Core",
        assetName: "Database",
        destinationPath: "/",
        connected: true
      },
      {
        id: "two",
        endpoint: { id: "sftp:two", label: "Backup" },
        organizationName: "Operations",
        assetName: "Archive",
        destinationPath: "/data",
        connected: true
      }
    ];

    expect(filterSftpDistributionTargets(targets, " core ")).toEqual([targets[0]]);
    expect(filterSftpDistributionTargets(targets, "archive")).toEqual([targets[1]]);
    expect(filterSftpDistributionTargets(targets, "missing")).toEqual([]);
  });

  it("keeps the first pane per assetId in caller order", () => {
    expect(
      uniqueRemotePanesForSend([
        { id: "left-y4", assetId: "y4", side: "left" },
        { id: "right-y4", assetId: "y4", side: "right" },
        { id: "other", assetId: "other", side: "left" }
      ]).map((pane) => pane.id)
    ).toEqual(["left-y4", "other"]);
    expect(
      uniqueRemotePanesForSend([
        { id: "right-first", assetId: "y4", side: "right" },
        { id: "right-second", assetId: "y4", side: "right" }
      ]).map((pane) => pane.id)
    ).toEqual(["right-first"]);
  });
});

describe("sftp transfer coordinator selectors", () => {
  const payload = {
    sourceEndpoint,
    sourcePath: "/srv/data/",
    sourceSelectionRevision: 3,
    destinationPath: "/target",
    entries: [
      { name: "ok.txt", size: "12" },
      { name: "invalid.txt", size: "invalid" },
      { name: "negative.txt", size: "-1" }
    ]
  };

  it("builds valid queue inputs and rejects same-endpoint transfers", () => {
    expect(buildSftpTransferInputs(payload, sourceEndpoint)).toEqual([]);
    expect(buildSftpTransferInputs(payload, destinationEndpoint)).toEqual([
      {
        batchId: "",
        sourceEndpoint,
        destinationEndpoint,
        source: { name: "ok.txt", size: 12, path: "/srv/data/ok.txt" },
        destinationPath: "/target",
        conflictPolicy: "ask"
      }
    ]);
    expect(
      buildSftpTransferInputs(
        { ...payload, entries: [{ name: "nested.txt", size: "4", relativeDir: "folder/child" }] },
        destinationEndpoint
      )[0]
    ).toMatchObject({
      source: { name: "nested.txt", path: "/srv/data/folder/child/nested.txt", relativeDir: "folder/child" },
      destinationPath: "/target/folder/child"
    });
  });

  it("shows nested transfer files with their relative directory and reloads ancestor listings", () => {
    expect(transferFileDisplayPath({ name: "ok.txt" })).toBe("ok.txt");
    expect(transferFileDisplayPath({ name: "nested.txt", relativeDir: "folder/child" })).toBe(
      "folder/child/nested.txt"
    );
    expect(transferFileBreadcrumbItems({ name: "ok.txt" })).toEqual([]);
    expect(transferFileBreadcrumbItems({ name: "hello.txt", relativeDir: "ai-test" })).toEqual([
      "ai-test",
      "hello.txt"
    ]);
    expect(transferFileBreadcrumbItems({ name: "d.txt", relativeDir: "a/b/c" })).toEqual(["a", "…", "d.txt"]);
    expect(isSftpDirectoryAffectedByTransfer("/home", "/home/file.txt")).toBe(true);
    expect(isSftpDirectoryAffectedByTransfer("/home", "/home/docs/nested/file.txt")).toBe(true);
    expect(isSftpDirectoryAffectedByTransfer("/home/docs", "/home/file.txt")).toBe(false);
    expect(isSftpDirectoryAffectedByTransfer("/", "/home/docs/file.txt")).toBe(true);
  });

  it("detects top-level folder collisions and rewrites keep-both prefixes", () => {
    expect(
      collidingTopLevelFolders(
        ["docs", "other"],
        [
          { name: "docs", is_dir: true },
          { name: "file.txt", is_dir: false }
        ]
      )
    ).toEqual(["docs"]);
    expect(pathBelongsToFolder("docs/nested", "docs")).toBe(true);
    expect(pathBelongsToFolder("other", "docs")).toBe(false);
    expect(nextKeepBothFolderName("docs", new Set(["docs", "docs (1)"]))).toBe("docs (2)");
    expect(rewriteFolderPrefix("docs/nested", "docs", "docs (1)")).toBe("docs (1)/nested");
    expect(destRootFromTask("/home/docs/nested", "docs/nested")).toBe("/home");
  });

  it("only clears a source after every target task for that file completed", () => {
    const task = (name: string, status: FileTransferTask["status"], target: string) =>
      ({
        source: { name },
        status,
        destinationEndpoint: { id: target }
      }) as FileTransferTask;
    const tasks = [
      task("done.txt", "completed", "one"),
      task("done.txt", "completed", "two"),
      task("partial.txt", "completed", "one"),
      task("partial.txt", "failed", "two")
    ];

    expect(completedTransferSourceNames(tasks)).toEqual(["done.txt"]);
  });
});
