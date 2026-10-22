import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./videoplayer.vue?raw";

const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
const file = ts.createSourceFile("videoplayer.ts", script, ts.ScriptTarget.Latest, true);
const append = file.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "appendParsedItems"
)!;
// Execute the page's actual import transaction without mounting its unrelated layout/player dependencies.
const { outputText } = ts.transpileModule(append.getText(file), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});

function archiveItems(archiveId: string): VideoPlayerItem[] {
  return ["a/session.cast", "b/session.cast"].map((name, entryId) => ({
    id: `${archiveId}:${entryId}`,
    name: "session.cast",
    source: "",
    type: "cast",
    meta: {},
    recordingId: archiveId,
    recordingLabel: archiveId,
    recordingEntry: { archiveId, entryId, name, size: 1 }
  }));
}

it("preserves same-name entries within an import and releases only subsequent duplicate imports", async () => {
  const items = { value: [] as VideoPlayerItem[] };
  const releaseItems = vi.fn(async () => {});
  const scope = {
    items,
    pageDisposed: false,
    importMessage: { value: "importing" },
    selectedId: { value: null as string | null },
    activeId: { value: null as string | null },
    releaseItems,
    t: (key: string) => key,
    toast: { add: vi.fn() }
  };
  const appendParsedItems = new Function(...Object.keys(scope), `${outputText}; return appendParsedItems;`)(
    ...Object.values(scope)
  ) as (parsed: VideoPlayerItem[]) => Promise<void>;

  const original = archiveItems("original");
  await appendParsedItems(original);
  expect(items.value).toEqual(original);
  expect(scope.activeId.value).toBe(original[0]!.id);
  expect(releaseItems).toHaveBeenLastCalledWith([], original);

  const duplicate = archiveItems("duplicate");
  await appendParsedItems(duplicate);
  expect(items.value).toEqual(original);
  expect(releaseItems).toHaveBeenLastCalledWith(duplicate, original);
  expect(scope.toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: "VideoPlayer.SkippedTitle" }));
});
