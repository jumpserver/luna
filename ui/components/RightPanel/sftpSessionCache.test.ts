import { describe, expect, it } from "vitest";
import { compactSftpCacheIdentity, nextSftpSessionCache } from "./sftpSessionCache";

const paneA = "pane-a";
const paneB = "pane-b";
const paneC = "pane-c";
const identityA = compactSftpCacheIdentity({
  paneId: paneA,
  protocol: "ssh",
  assetId: "host-a",
  account: "root",
  sessionId: "sess-a"
});
const identityB = compactSftpCacheIdentity({
  paneId: paneB,
  protocol: "ssh",
  assetId: "host-b",
  account: "root",
  sessionId: "sess-b"
});

describe("compactSftpCacheIdentity", () => {
  it("is empty for non-SSH, missing pane, or missing koko session id", () => {
    expect(compactSftpCacheIdentity({ paneId: paneA, protocol: "rdp", sessionId: "sess-a" })).toBe("");
    expect(compactSftpCacheIdentity({ paneId: "", protocol: "ssh", sessionId: "sess-a" })).toBe("");
    expect(compactSftpCacheIdentity({ paneId: paneA, protocol: "ssh" })).toBe("");
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
        [
          paneC,
          compactSftpCacheIdentity({
            paneId: paneC,
            protocol: "ssh",
            assetId: "host-c",
            account: "root",
            sessionId: "sess-c"
          })
        ]
      ]),
      activePaneId: paneC,
      sftpTabVisible: false
    });
    expect(next.map((entry) => entry.paneId)).toEqual([paneA, paneB]);
  });

  it("drops a closed pane", () => {
    const next = nextSftpSessionCache({
      cached: [
        { paneId: paneA, identity: identityA },
        { paneId: paneB, identity: identityB }
      ],
      identities: new Map([[paneB, identityB]]),
      activePaneId: paneB,
      sftpTabVisible: true
    });
    expect(next).toEqual([{ paneId: paneB, identity: identityB }]);
  });

  it("replaces the instance when account or session id changes", () => {
    const rotated = compactSftpCacheIdentity({
      paneId: paneA,
      protocol: "ssh",
      assetId: "host-a",
      account: "admin",
      sessionId: "sess-a2"
    });
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, rotated]]),
      activePaneId: paneA,
      sftpTabVisible: true
    });
    expect(next).toEqual([{ paneId: paneA, identity: rotated }]);
  });

  it("prunes a rotated identity even when the SFTP tab is hidden", () => {
    const rotated = compactSftpCacheIdentity({
      paneId: paneA,
      protocol: "ssh",
      assetId: "host-a",
      account: "admin",
      sessionId: "sess-a2"
    });
    const next = nextSftpSessionCache({
      cached: [{ paneId: paneA, identity: identityA }],
      identities: new Map([[paneA, rotated]]),
      activePaneId: paneB,
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
        sftpTabVisible: true
      })
    ).toEqual([]);
    expect(
      nextSftpSessionCache({
        cached: [],
        identities: new Map([[paneA, ""]]),
        activePaneId: paneA,
        sftpTabVisible: true
      })
    ).toEqual([]);
  });
});
