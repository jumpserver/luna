import type { FileTransferTask } from "~/shared/file-transfer/types";
import { describe, expect, it } from "vitest";
import {
  assetSupportsSftp,
  buildSftpTransferInputs,
  completedTransferSourceNames,
  defaultGlobalLeftPaneId,
  filterSftpDistributionTargets,
  rememberSftpConnection
} from "#koko/composables/sftp/file-manager/selectors";

const sourceEndpoint = { id: "sftp:source", label: "Source" };
const destinationEndpoint = { id: "sftp:destination", label: "Destination" };

describe("sftp workspace selectors", () => {
  it("chooses the runtime-specific default pane for the global workspace", () => {
    expect(defaultGlobalLeftPaneId(true)).toBe("local");
    expect(defaultGlobalLeftPaneId(false)).toBe("web-upload");
  });

  it("accepts undeclared or SFTP-capable assets and rejects explicit non-SFTP assets", () => {
    expect(assetSupportsSftp()).toBe(true);
    expect(assetSupportsSftp([])).toBe(true);
    expect(assetSupportsSftp([{ name: "SSH" }, { name: " SFTP " }])).toBe(true);
    expect(assetSupportsSftp([{ name: "SSH" }])).toBe(false);
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
