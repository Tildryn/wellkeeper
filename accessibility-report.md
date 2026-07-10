# Accessibility Compliance — WellKeeper

**Standard:** WCAG 2.1 AA

---

## Semantic Structure

- All pages use a `<main id="main-content">` landmark; the authenticated app's `<main>` carries `tabIndex={-1}` and receives programmatic focus on every page navigation.
- Navigation bar marked as `<nav aria-label="Main navigation">` with `aria-current="page"` on the active link.
- Visually hidden `<h1>` and per-page `<h2>` headings preserve document outline without affecting the visual layout.
- ARIA table roles (`table`, `row`, `columnheader`, `cell`) applied to the CD Keys list, which is rendered with `<div>` elements.
- Search results list age-divider uses `role="separator"` with a descriptive `aria-label`.

---

## Keyboard Navigation & Focus Management

- Focus moves to `<main>` on every page change.
- All modals (Ban, Convert-to-Temporary, Ban Detail) implement a focus trap: focus is set to the first interactive element on open, Tab wraps between first and last focusable elements, Escape closes the modal, and focus returns to the trigger element on close.
- Inline confirm flows (ban, unban, expunge, unlink CD key) move focus to the primary confirm button when they appear.
- Inline add-field and reason-edit inputs move focus to themselves on open; Enter confirms, Escape cancels.
- All interactive elements receive visible focus indicators via global `:focus-visible` rules (2px accent-colour outline).

---

## Screen Reader Support

- All decorative SVG icons carry `aria-hidden="true"`; all action buttons carry descriptive `aria-label` values.
- Password visibility toggles use dynamic labels: *"Show/Hide [field name]"* across Login, Register, Reset Password, and Settings pages.
- Expand/collapse toggles carry `aria-expanded` and `aria-controls` referencing the controlled panel's `id`.
- Sort buttons expose state via `aria-pressed` and include sort direction in their `aria-label`.
- Bans filter buttons use `aria-pressed` for toggle state.
- Search result counts are in permanently-rendered `aria-live="polite" aria-atomic="true"` regions on both the Bans and All Players pages.
- CD Key linking OTP is announced via a permanently-rendered visually-hidden `aria-live="polite"` paragraph (dynamically injected live regions are unreliable in screen readers).
- Ban record save confirmation uses `role="status"` in a visually-hidden element.
- Error messages use `role="alert"` for immediate announcement; loading states use `role="status"`.
- Modals are marked `role="dialog" aria-modal="true" aria-labelledby="[title-id]"`.
- "Kick pending" spinner contains a visually-hidden text label.
- CD Keys table "Actions" column header contains visually-hidden text to avoid an empty header cell.
- Privacy page external links include a visually-hidden *"(opens in new tab)"* notice.
- Non-functional feature buttons (Description, Inner World) use `aria-disabled="true"` rather than `disabled`, keeping them keyboard-discoverable while suppressing interaction.

---

## Colour Contrast

- All small-text elements that previously used `opacity: 0.75` on the secondary text colour were corrected — the combination produced #7c828c at 4.34:1 against the dark background, failing the 4.5:1 threshold. Opacity removed; the base colour `#9ca3af` passes at approximately 5.5:1.
- Danger-action text (ban/unban buttons) uses a dedicated `--danger: #e55565` token confirmed to pass contrast requirements.

---

## Reduced Motion

- The kick-pending spinner animation is disabled under `prefers-reduced-motion: reduce`.
