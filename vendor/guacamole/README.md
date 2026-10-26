# Guacamole recording runtime for Luna v3

This private runtime is backported from Luna dev commit
`f92396b41d0354102a4efbf06093b127a9bc6873` (#1805). Only the Luna recording
player imports it. Lion connections and monitoring continue to use the separate
Lion application's own JavaScript dependencies.

## Upstream provenance

- Apache Guacamole **1.5.5**: https://github.com/apache/guacamole-client
- Pinned commit: `df6f9f335842db3c8156146196fafc4f2a14e410`
- Official artifact: https://repo.maven.apache.org/maven2/org/apache/guacamole/guacamole-common-js/1.5.5/guacamole-common-js-1.5.5.zip
- ZIP SHA-256: `ca6c921f162ce1bcbe4a5e45b0bc592983ffbda032f543078b900eaf4a811e00`
- Unmodified `all.js` SHA-256: `d174d60af4952c3f6627d301f28cfd5db36615b1a8166a646c3666e9e5293d14`

The original Apache source files, LICENSE, NOTICE, manifest and four local patches
are copied unchanged from dev. The original 1.5.5 source reports API_VERSION
`1.5.4`; the artifact and pinned commit identify the release. No npm download or
moving Git dependency is used to build the runtime. `index.d.ts` describes only
the APIs used by v3 and supports its existing TypeScript 3.5 compiler.

## Building and testing

`yarn start`, `yarn build` and `yarn test` first generate the ignored
`dist/guacamole.js`. Docker builds generate it after copying the committed
sources. The builder uses Node.js standard APIs compatible with the existing
Node 16 image and verifies source hashes, assembly order and exact patch context.

```sh
yarn build:guacamole
node vendor/guacamole/scripts/build.mjs --check
yarn test:guacamole
```

The focused Jasmine tests run the actual recording runtime and IndexedDB reader
in headless Chrome, including seek/render behavior, snapshot bounds, streaming
gzip, cancellation and cleanup. Modify patches against the unchanged upstream
files and regenerate the runtime; do not edit or commit generated output.

## Storage and memory bounds

`src/app/elements/replay/guacamole/recording-source.ts` adapts dev's recording
source to the browser URL input used by v3. Downloads and up to two gzip layers
are streamed into a temporary IndexedDB database in serialized 2 MiB writes.
Only committed byte ranges are indexed. Playback reads individual frames through
an eight-block (16 MiB) LRU. Quota/unavailable-storage failures stop playback
instead of falling back to whole-recording memory storage. Disposal cancels
downloads and rendering, clears caches, and deletes the temporary database.
Abandoned caches older than 24 hours are swept where database enumeration exists.

The SessionRecording patch keeps the first frame as a backward-seek anchor and
at most 32 optional snapshots totaling 32 MiB. Explicit seeks snapshot only the
anchor and destination. Display and Client patches release decoded images and
temporary snapshot canvases. Reads and rendering are serialized so replaced seeks
cannot apply additive drawing instructions twice.

These are cache budgets, not a total browser-memory limit: the frame index,
anchor snapshot, active frame/instruction, live canvases and browser internals are
additional. Private browsing may keep IndexedDB in memory. The recording still
requires a sequential download/index scan; seeking to unindexed data waits for it.
Browser playback needs Fetch streams, IndexedDB and AbortController; raw gzip
additionally needs DecompressionStream.
