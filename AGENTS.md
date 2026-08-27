# Repository Instructions

## Scope

These instructions apply to the whole repository. Follow them for all changes unless a more specific `AGENTS.md` exists in a subdirectory.

## Project Shape

- This is a JumpServer repository with a Nuxt/Vue frontend under `ui/`.
- This is also an Electron project with both web and desktop client builds; implementation must consider both runtime environments.
- Nuxt uses `srcDir: "ui/"`.
- The frontend is built around Nuxt UI, `@nuxt/icon`, shared theme tokens, and connector/workspace modules.

## Runtime Rules

- Keep browser and Electron desktop behavior compatible unless a feature is explicitly desktop-only or web-only.
- Do not assume `window`, filesystem access, native dialogs, shell commands, or Electron APIs are available in ordinary shared UI code without a runtime guard.
- Use existing runtime helpers and abstractions before adding new environment checks.
- Keep desktop-specific behavior behind Electron modules/adapters, and keep web behavior functional when those APIs are unavailable.
- When changing routing, API calls, storage, downloads, websocket/session handling, or connector launch behavior, consider both the web build and the desktop client build.
- Login flows are intentionally split by runtime: web must redirect unauthenticated users to the server auth page, while the Electron client keeps the in-app "enter site, then login" flow. Do not replace one runtime's login UX with the other's.
- Authentication state is determined by validating the user session/profile, not by organization availability. Missing organization data or an organization-scoped `403` must not mark an authenticated user as logged out.
- Keep authentication bootstrap connected to the application startup path. Do not use a `*.global.client.ts` route-middleware filename: Nuxt treats it as named middleware rather than global middleware.

## Engineering Style

- Prefer the simplest solution that works. Efficient means less code and fewer moving parts, not less understanding.
- Before writing code, check this ladder in order:
  - Does this need to be built at all?
  - Does it already exist in this codebase?
  - Does the standard library or platform already cover it?
  - Does an already-installed dependency solve it?
  - Can the change be smaller while still correct?
  - Only then write the minimum code that works.
- Read the task and the touched code before choosing the smallest change. A small diff in the wrong place is still a bug.
- Fix bugs at the root cause. When touching a shared function, inspect its callers and fix the common path rather than patching only one symptom.
- Do not add abstractions, dependencies, boilerplate, or extra files unless they clearly pay for themselves.
- Prefer deletion over addition, boring over clever, and the fewest files possible.
- Question complex requests when a simpler existing path may cover the need.
- Choose the edge-case-correct standard approach when two options are similar in size.
- Mark intentional simplifications with a `ponytail:` comment when they have a known ceiling, and name the ceiling plus the upgrade path.
- Do not cut corners on trust-boundary input validation, data-loss prevention, security, accessibility, hardware/runtime realities, or explicitly requested behavior.
- Non-trivial logic should leave one small runnable check behind when practical. Trivial one-line changes do not need a new test.

## UI Rules

- Use Nuxt UI components first for application UI: `UButton`, `UInput`, `USelectMenu`, `UDropdownMenu`, `UModal`, `UPopover`, `UAccordion`, `UBadge`, `UIcon`, and related primitives.
- Do not introduce another UI component library for normal product work or migrations.
- Do not copy UI-library patterns from migrated projects. Rebuild migrated UI using the local Nuxt UI patterns.
- Keep workspace screens compact, operational, and consistent with nearby components in `ui/components/`, `ui/chen/`, `ui/lion/`, and `ui/koko/`.
- Bespoke markup is acceptable for protocol/editor surfaces such as xterm, CodeMirror, iframe shells, file trees, and data grids when Nuxt UI is not the right primitive.
- Keep workspace tab strips content-sized up to the available width: with few tabs, each tab should use its preferred wide width and the adjacent create (`+`) control must remain immediately after the last tab, not at the far edge of the header.
- As workspace tabs increase, shrink them evenly down to their minimum width before enabling horizontal overflow. Do not make the tab strip `flex-1` or replace its explicit ideal width with intrinsic `w-fit`; both have caused regressions between tab sizing and create-control placement. Apply this contract consistently to the main workspace header and nested workspaces such as the Chen database console.
- When changing workspace tab layout, verify at least the one-tab, two-tab, shrinking, and overflow states, including the position of the create (`+`) control.

## Theme Rules

- Use the existing theme system instead of ad hoc colors.
- Prefer semantic CSS variables such as `--app-*`, `--workspace-*`, `--editor-*`, `--terminal-*`, and `--data-grid-*`.
- Do not hardcode one-off dark/light color branches or infer connector/workspace colors from `primary` alone.
- Check `ui/assets/css/main.css`, `ui/app.config.ts`, and `ui/shared/theme/` before adding or changing theme behavior.
- If a reusable visual concept needs a token, add it to the existing theme pipeline rather than scattering literal colors/classes.

## Icon Rules

- Use `UIcon` or Nuxt UI `icon` props with configured `@nuxt/icon` collections.
- Prefer `i-lucide-*` for generic UI actions and states unless nearby code already uses a more specific configured collection.
- Do not add new icon packages for ordinary UI work.
- Do not import `lucide-vue-next` in new code; use Nuxt Icon names instead.
- Use local custom SVG/Vue icons only for product-specific symbols that configured icon collections do not cover.

## API Rules

- Use `apiRequest` from `ui/composables/useApiRequest.ts` for JumpServer core REST API calls.
- Keep shared/core API helpers near the existing wrapper or in feature modules that use it.
- Raw `fetch` is acceptable for connector-owned endpoints, websocket/session/protocol setup, streaming or non-JSON responses, third-party URLs, and compatibility modules with intentional header/path behavior.
- When raw `fetch` is needed, keep it in a small API helper instead of scattering calls through Vue components.
- Do not duplicate Electron/browser branching, request headers, mutation headers, or token handling outside the existing wrapper without a clear reason.

## Migration Rules

- During Luna or other frontend migrations, preserve behavior while adapting implementation to this repo's Nuxt UI, icon, theme, route, i18n, and connector patterns.
- Do not add migrated UI libraries, parallel theme systems, or framework-specific service/state/router patterns that conflict with the current Nuxt/Vue architecture.
- Keep connector boundaries under `ui/shared/connectors/`, `ui/koko/`, `ui/lion/`, and `ui/chen/` clear.

## Useful References

- `ui/app.config.ts`: Nuxt UI component defaults.
- `ui/assets/css/main.css`: global CSS variables and semantic tokens.
- `ui/shared/theme/`: theme schema, presets, adapters, and built-in preset CSS.
- `ui/composables/useApiRequest.ts`: core API wrapper.
- `DESIGN.md`: shared workspace and theme direction.

## Validation

After edits, run the smallest meaningful validation for the touched area, such as lint, typecheck, build, or focused runtime checks. Also scan relevant changes for accidental dependency, icon, API, and color-rule violations when the touched area involves frontend workspace code.
