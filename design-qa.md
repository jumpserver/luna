# Design QA

- Scope: desktop-only AI settings and the SSH/local-shell `Cmd/Ctrl + K` contextual command panel.
- Visual target: the selected compact two-column settings direction, using the existing JumpServer/Nuxt UI tokens and terminal surfaces.
- References: the supplied terminal captures plus `/Users/zhaojisen/.codex/generated_images/01a0332e-7bba-7911-831a-9a505f220d2c/exec-a5c07f42-ba38-4c17-a246-cbe8e44e6c5b.png`.
- Settings capture reviewed: `/tmp/jumpserver-ai-settings-enable4.png`.

## Review

- Hierarchy: provider/CLI navigation remains compact; status badges use one label per source; endpoint, credential, and model controls use the same two-column rhythm.
- Runtime boundary: AI settings and keyboard interaction are absent from the standalone web runtime.
- Terminal panel: non-modal and mask-free; anchored to the active Xterm buffer cursor, constrained to the active terminal pane, and flipped above the cursor when the lower edge has insufficient room.
- Discoverability: a passive, pointer-transparent shortcut hint remains inside eligible desktop terminal surfaces while the panel is closed.
- Composition: the prompt state uses a compact two-row command palette with the generation action in the same visual group; proposal and risk states retain distinct hierarchy.
- Risk states: low, medium, and high use semantic Nuxt UI colors; high risk adds an error ring, tinted command surface, shield alert, risk reason, and explicit destructive-action label.
- Accessibility: non-modal dialog semantics, labeled prompt and close action, restored terminal focus, interruptible Escape/outside-click handling, reduced-motion support, and live error/proposal updates.
- Theme consistency: all surfaces, borders, text, and muted states use existing semantic application tokens; no new palette or icon dependency was introduced.
- Web Interface Guidelines: no remaining findings in the touched command panel.

final result: passed
