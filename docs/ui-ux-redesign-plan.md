# Fryva Product UI/UX Redesign Plan

## Step 1 — UX audit summary (current state)

### Cross-product issues found
- Inconsistent spacing, card rhythm, and typographic hierarchy across pages.
- Navigation looked like raw links instead of role-aware product architecture.
- Critical workflows (POS, debts, operations) had low visual trust and weak action hierarchy.
- Data-heavy views lacked consistent table shells, status indicators, and financial emphasis patterns.
- Forms were mostly flat input stacks with weak grouping and insufficient focus/error feedback.
- Mobile behavior was implicit, not intentionally designed (especially for POS and stock entry).

### Role-specific gaps
- **Owner:** lacked “mission control” feel; financial, debt, and operations context was fragmented.
- **Waiter:** dashboard and POS needed faster visual scanning and fewer ambiguous controls.
- **Chef:** opening stock/production/expenses needed denser but cleaner entry ergonomics.

## Step 2 — Design system foundation in code

Implemented a unified product design foundation using shared tokens and reusable UI primitives:

- **Tokens (`app/globals.css`)**
  - Brand palette (red/black/white + slate neutrals + semantic colors).
  - Type hierarchy and spacing rhythm tokens.
  - Surface, border, radius, and shadow rules.
- **Core primitives (`components/ui/fryva-ui.tsx`)**
  - Metric card
  - Empty state
  - Status chip
- **Interaction standards**
  - Button variants (primary/secondary/ghost/danger)
  - Unified inputs/select/textarea with consistent focus rings
  - Alert styles for success/error feedback
  - Table shell with sticky headers and numeric alignment

## Step 3 — Structured application redesign rollout

### Global shell and navigation
- Redesigned `DashboardShell` to include:
  - Sticky premium topbar
  - Role-aware grouped nav architecture
  - Active state visibility
  - Better role context and sign-out action treatment

### Auth and onboarding
- Redesigned login into premium split-screen layout with stronger brand and trust cues.
- Improved form hierarchy, labels, error visibility, and loading behavior.

### Core workflow redesigns
- **Owner dashboard:** mission-control KPI architecture + stock summary table.
- **Waiter dashboard:** fast KPI scan + direct operational actions.
- **Chef dashboard:** task-first kitchen navigation cards.
- **POS:** dual-pane operational layout with menu grid, cart controls, payment segmentation, debt-specific conditional fields, and clearer confirmation/error states.
- **Debts:** status filtering, stronger debt cards, status chips, cleaner payment capture flow.
- **Purchases:** grouped operational form with linked-item flow and clearer cost capture.
- **Expenses (owner & chef):** faster repeat-entry forms and consistent feedback patterns.
- **Opening stock:** table-style bulk entry for faster morning capture.
- **Production:** simplified fast-entry form.
- **Operations:** high-trust danger zones for void/write-off actions and structured reconciliation blocks.

## Mobile-first behavior improvements
- Added mobile-first shell fallbacks and utility compatibility to prevent broken dense layouts.
- Introduced responsive POS stacking for smaller screens.
- Standardized touch-ready button sizing and spacing.

## Non-functional guarantees
- No business logic changes to Supabase action calls.
- Route structure preserved.
- Security model unchanged.
