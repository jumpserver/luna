# Online Player visual QA

- Reference: user-provided replay control screenshots from 2026-08-21.
- Generated capture: `.omx/state/online-player/replay-controls.png`.
- Verdict: pass (95/100), recorded in `.omx/state/online-player/ralph-progress.json`.

## Verified

- Playlist, speed, download, and command-rail controls share a fixed 32px action row and vertical center line.
- Download is icon-only, uses the ghost button variant, and sits beside speed.
- The command rail is collapsed by default and opened from the bottom action row.
- The progress bar remains a separate fixed row and does not overlap the playback viewport.
- Guacamole content keeps its aspect ratio across viewport changes.

## Automated coverage

- Online-player unit tests: 24 passed.
- Replay E2E: geometry, theme, GUA seeking, play/pause, default rail state, parts placement, and responsive layout.
