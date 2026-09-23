import { describe, expect, it } from "vitest";
import { compactSftpCacheIdentity, nextSftpSessionCache } from "./sftpSessionCache";

const paneA = "pane-a";
const paneB = "pane-b";
const paneC = "pane-c";
const identityA = compactSftpCacheIdentity({
  paneId: paneA,
  protocol: "ssh",
  assetId: "host-a",
  account: "root"
});
const identityB = compactSftpCacheIdentity({
  paneId: paneB,
  protocol: "ssh",
  assetId: "host-b",
  account: "root"
});

describe("compactSftpCacheIdentity", () => {
  it("is empty for non-SSH or missing pane", () => {
    expect(compactSftpCacheIdentity({ paneId: paneA, protocol: "rdp" })).toBe("");
    expect(compactSftpCacheIdentity({ paneId: "", protocol: "ssh" })).toBe("");
  });

  it("binds to the asset, not the SSH session instance", () => {
    expect(compactSftpCacheIdentity({ paneId: paneA, protocol: "ssh", assetId: "host-a", account: "root" })).toBe(
      identityA
    );
    expect(compactSftpCacheIdentity({ paneId: paneA, protocol: "ssh", assetId: "host-a", account: "admin" })).not.toBe(
      identityA
    );
  });
});

describe("nextSftpSessionCache", () => {
  it("adds B beside A when SFTP is visible", () => {
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([
        [paneA, identityA],
        [paneB, identityB]
      ]),
      activePaneId: paneB,
      activeReady: true,
      sftpTabVisible: true
    });
    expect(next).toEqual([
      { paneId: paneA, identity: identityA },
      { paneId: paneB, identity: identityB }
    ]);
  });

  it("does not create C while the SFTP tab is hidden", () => {
    const next = nextSftpSessionCache({
      cached: [
        { paneId: paneA, identity: identityA },
        { paneId: paneB, identity: identityB }
      ],
      identities: new Map([
        [paneA, identityA],
        [paneB, identityB],
        [paneC, compactSftpCacheIdentity({ paneId: paneC, protocol: "ssh", assetId: "host-c", account: "root" })]
      ]),
      activePaneId: paneC,
      activeReady: true,
      sftpTabVisible: false
    });
    expect(next.map((entry) => entry.paneId)).toEqual([paneA, paneB]);
  });

  it("keeps mounted surfaces while the panel is hidden", () => {
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, identityA]]),
      activePaneId: paneA,
      activeReady: true,
      sftpTabVisible: false
    });
    expect(next).toEqual([{ paneId: paneA, identity: identityA }]);
  });

  it("keeps the surface when the koko session id is briefly unavailable", () => {
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, identityA]]),
      activePaneId: paneA,
      activeReady: false,
      sftpTabVisible: true
    });
    expect(next).toEqual([{ paneId: paneA, identity: identityA }]);
  });

  it("waits for the koko session before creating a surface", () => {
    const next = nextSftpSessionCache({
      cached: [],
      identities: new Map([[paneA, identityA]]),
      activePaneId: paneA,
      activeReady: false,
      sftpTabVisible: true
    });
    expect(next).toEqual([]);
  });

  it("drops a closed pane", () => {
    const next = nextSftpSessionCache({
      cached: [
        { paneId: paneA, identity: identityA },
        { paneId: paneB, identity: identityB }
      ],
      identities: new Map([[paneB, identityB]]),
      activePaneId: paneB,
      activeReady: true,
      sftpTabVisible: true
    });
    expect(next).toEqual([{ paneId: paneB, identity: identityB }]);
  });

  it("replaces the instance when the account changes", () => {
    const rotated = compactSftpCacheIdentity({
      paneId: paneA,
      protocol: "ssh",
      assetId: "host-a",
      account: "admin"
    });
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, rotated]]),
      activePaneId: paneA,
      activeReady: true,
      sftpTabVisible: true
    });
    expect(next).toEqual([{ paneId: paneA, identity: rotated }]);
  });

  it("prunes a rotated identity even when the SFTP tab is hidden", () => {
    const rotated = compactSftpCacheIdentity({
      paneId: paneA,
      protocol: "ssh",
      assetId: "host-a",
      account: "admin"
    });
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, rotated]]),
      activePaneId: paneB,
      activeReady: true,
      sftpTabVisible: false
    });
    expect(next).toEqual([]);
  });

  it("does not cache a non-SSH or missing pane", () => {
    expect(
      nextSftpSessionCache({
        cached: [],
        identities: new Map(),
        activePaneId: paneA,
        activeReady: true,
        sftpTabVisible: true
      })
    ).toEqual([]);
    expect(
      nextSftpSessionCache({
        cached: [],
        identities: new Map([[paneA, ""]]),
        activePaneId: paneA,
        activeReady: true,
        sftpTabVisible: true
      })
    ).toEqual([]);
  });
});
