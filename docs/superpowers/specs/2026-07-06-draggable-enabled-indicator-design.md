# Draggable Enabled Indicator Design

## Goal

Show a visible, draggable indicator on supported chat pages while Context Pinner is enabled. Changing the popup toggle refreshes only the current active supported page so the indicator and injection state are applied from a clean page load.

This release supports Kimi only, while keeping site detection and page UI reusable for future ChatGPT, Doubao, and other adapters.

## User Experience

- When automatic injection is enabled, a green fixed-position capsule appears in the upper-right corner of the Kimi page.
- The capsule reads `● Context 已开启`.
- The user can drag it with a mouse, touch, or other pointer input.
- Dragging is constrained to the visible viewport so the capsule cannot be lost off-screen.
- The dragged position is session-only. A page refresh restores the default upper-right position.
- When automatic injection is disabled, no capsule is present.
- After a successful enabled-to-disabled or disabled-to-enabled toggle, the extension refreshes only the current active tab when that tab is a supported site.
- If the active tab is unsupported, the setting is saved but no tab is refreshed.
- If saving fails, no tab is refreshed and the popup reports the existing save error.

## Architecture

### Site registry

Add a shared site registry that owns supported-site metadata and URL matching. The first registry entry represents Kimi and matches `https://www.kimi.com/*`.

The popup asks the registry whether the active tab is supported instead of embedding a Kimi-specific URL check. Adding another provider later requires a new registry entry, corresponding manifest host permissions and content-script registration, and a provider-specific message-input adapter.

The registry does not grant permissions dynamically. The manifest remains the security boundary and continues to request Kimi access only in this release.

### Page indicator

Add a site-independent page-indicator module. It exposes small operations to:

- create or update the enabled indicator;
- remove the indicator;
- bind pointer dragging once;
- constrain its position after drag movement and viewport resize.

The component uses a unique DOM ID to prevent duplicates, fixed positioning, a high stacking level, and isolated inline or namespaced styles. Only the capsule itself accepts pointer input; it must not create a page-sized overlay or block Kimi controls.

The Kimi content script loads settings at startup and synchronizes the indicator from `settings.enabled`. The existing injection cache continues to use the same setting. Storage-change handling may update cached settings, but toggle-driven consistency comes from the explicit active-tab reload.

### Popup reload flow

The popup toggle flow is:

1. Capture the requested state.
2. Save normalized settings.
3. Update the popup's saved-state snapshot.
4. Query the current active tab in the current window.
5. Use the site registry to identify whether its URL is supported.
6. Reload that tab only when supported.

Tab query or reload failure must not undo a setting that was already saved. The popup reports a concise refresh failure while leaving the saved toggle state visible. A save failure stops before tab lookup and reload.

The manifest adds `activeTab`, which scopes tab access to the tab on which the extension action was invoked. It does not add `tabs` or `scripting`.

## Extensibility Boundary

Common behavior remains provider-neutral:

- settings and the enabled toggle;
- supported-URL lookup;
- active-tab refresh orchestration;
- enabled indicator rendering and dragging.

Provider-specific behavior remains isolated:

- message editor and send-button selectors;
- editor state replacement;
- manifest match and host permission entries;
- any provider-specific indicator text override, if needed later.

This release does not add ChatGPT or Doubao permissions, selectors, or runtime code.

## Error Handling

- Missing or malformed tab URLs are treated as unsupported and are not refreshed.
- Missing `chrome.tabs` support leaves the saved setting intact and reports refresh failure.
- Indicator creation is idempotent and safely does nothing if the document root is unavailable.
- Pointer cancellation ends dragging without persisting coordinates.
- Viewport resize clamps a previously dragged indicator back into view.
- A content-script settings failure uses the existing normalized defaults and must not break Kimi interaction.

## Testing

Automated tests cover:

- supported and unsupported URL matching through the site registry;
- creating the indicator when enabled and omitting/removing it when disabled;
- repeated synchronization without duplicate indicators;
- pointer dragging and viewport boundary clamping;
- successful toggle saves followed by reload of the current supported active tab;
- no reload for an unsupported active tab;
- no reload after a save failure;
- existing prompt injection and popup behavior remain green.

Manual verification covers loading the unpacked extension, toggling on and off from a Kimi tab, observing exactly one reload per successful state change, confirming the capsule appears or disappears, dragging it around the viewport, and confirming refresh restores its default position.

## Out of Scope

- Persisting the dragged capsule position.
- Refreshing background Kimi tabs.
- Supporting ChatGPT, Doubao, or other providers in this release.
- Adding broad host, `tabs`, or `scripting` permissions in anticipation of future providers.
