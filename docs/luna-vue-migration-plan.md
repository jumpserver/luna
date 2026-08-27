# Luna Vue Migration Plan

## Target Layout

The shared workspace keeps the Luna product shape while using the Nuxt UI implementation already evolving in the desktop client:

```text
top menu / workspace chrome
--------------------------------
asset tree | terminal tabs
           |--------------------
           | connector view
           |
--------------------------------
status footer
```

## Implementation Order

1. Shared workspace shell
   - Extract the layout frame into reusable Vue components.
   - Keep header, asset sidebar, main workspace, and footer as slots.
   - Desktop consumes this first so the shared API is shaped by real usage.

2. Shared tab lifecycle
   - Keep `useWorkspaceTabs` as the first workspace-core module.
   - Add browser-safe close/focus/reconnect contracts before Luna consumes it.

3. Koko web adapter
   - Make iframe connector loading the default browser-compatible adapter.
   - Keep built-in terminal as desktop-only experimental fallback.

4. Luna Nuxt entry
   - Add a Nuxt-hosted Luna workspace that imports the shared shell and workspace modules.
   - Initially reuse Koko connector pages through iframe URLs.

5. Asset tree parity
   - Move the current desktop asset tree out of Electron assumptions.
   - Add Luna-specific organization, async tree loading, and tree filter behavior through platform services.

6. Feature migration
   - Migrate connect dialog, reconnect, clone tab, split view, batch command, and footer status one slice at a time.
   - Retire matching Angular Luna components only after the Vue slice is available.

## Current Step

The first slice is in place:

- `WorkspaceShell` provides the reusable top/sidebar/main/footer frame.
- `WorkspaceStatusFooter` restores the Luna-style bottom area for active session state.
- The desktop default layout now consumes the shell instead of owning the frame directly.
- `useWorkspaceTabs` owns shared tab lifecycle and delegates host-specific session disposal.
- `useWorkspaceConnectors` owns connector host adapters such as Koko ticket creation.
