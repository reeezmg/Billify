# Billify Architecture

## Overview

Billify is an Electron + React desktop app for electricity bill management and tenant bill splitting.
It uses Electron for the desktop shell, React Router for the UI, and sql.js-backed SQLite storage in the main process.

The app has two practical runtime modes:

1. Electron desktop mode, which uses the real IPC, SQLite, and WhatsApp integration.
2. Chrome renderer mode, which uses a localStorage-backed browser API shim for fast UI testing.

## Tech Stack

- Electron 35
- electron-vite 2
- React 18
- React Router 6
- Tailwind CSS 3
- sql.js for local SQLite persistence
- bcryptjs for password hashing
- electron-updater for Windows auto updates from GitHub Releases
- axios + form-data for WhatsApp Graph API calls
- pdfkit for PDF generation

## Repository Map

### Desktop shell

- `electron/main.ts`
- `electron/preload.ts`
- `electron/ipc/*.ipc.ts`
- `electron/services/*.service.ts`
- `electron/db/client.ts`
- `electron/db/migrations/0001_init.sql`

### Renderer

- `src/main.tsx`
- `src/App.tsx`
- `src/pages/*`
- `src/components/*`
- `src/lib/calc.ts`
- `src/lib/browserApi.ts`
- `src/types.ts`

### Scripts

- `scripts/without-electron-run-as-node.cjs`
- `scripts/dev-chrome.mjs`

## Runtime Modes

### Electron desktop mode

`npm run dev` starts the Electron app through `electron-vite`.
The browser window loads the renderer bundle and receives `window.api` from the preload script.

### Chrome renderer mode

`npm run dev:chrome` starts the Vite renderer directly and opens Chrome.
If Electron preload is unavailable, `src/App.tsx` injects the browser API shim from `src/lib/browserApi.ts`.
That shim stores its own data in `localStorage`, so it is separate from the Electron SQLite database.

## Startup Flow

1. `electron/main.ts` creates the main window.
2. The main process registers IPC handlers and, when packaged on Windows, checks GitHub Releases for updates:
   - auth
   - tenants
   - bills
   - splits
   - management
   - payments
   - users
   - settings
   - WhatsApp
3. `electron/preload.ts` exposes the IPC API on `window.api`.
4. `src/main.tsx` mounts the React app inside `BrowserRouter`.
5. `src/App.tsx` loads the current session and routes the user to the right screen.

## Renderer Structure

### App entry

`src/App.tsx` owns top-level routing and session bootstrap.
It loads the session through `window.api.auth.getSession()` and renders:

- `/login`
- `/setup-password`
- `/`
- `/tenants`
- `/bills`
- `/bills/:billId/split`
- `/management`
- `/management/:batchId`
- `/payments`
- `/users`
- `/settings`

### Layout and navigation

`src/components/Layout.tsx` provides the sidebar, page shell, breadcrumbs, signed-in user header, and logout action.
It conditionally shows admin links when `session.role === 'admin'`.

### Route guard

`src/components/ProtectedRoute.tsx` blocks access when:

- the user is not signed in
- the route requires admin access
- the user still must change their password

### Page responsibilities

- `src/pages/Login.tsx`: sign in with the seeded admin or a created user
- `src/pages/SetupPassword.tsx`: force password change for first-time users
- `src/pages/Dashboard.tsx`: informative landing page with live billing metrics, payment progress, payment methods, recent bills, top consumers, and tenant payment attention cards in a compact overview layout
- `src/pages/Tenants.tsx`: create, edit, list tenants, and open tenant bill history
- `src/pages/TenantBills.tsx`: show one tenant's electricity and management bill history with tabs, combined payment summary, reminder actions, payment updates, and payment dates
- `src/pages/MyBills.tsx`: create and edit monthly bills in a modal, list bills with split status, then navigate to splits
- `src/pages/BillSplit.tsx`: enter readings, adjust split values, save drafts or finalize splits, show finalized tenant bill status/actions, download tenant PDFs into a bill-period subfolder, send them through WhatsApp, and sync tenant present readings
- `src/pages/Management.tsx`: create management billing batches, rescan tenant fees into existing batches, download batch PDFs, send batch WhatsApp messages, and open batch details
- `src/pages/ManagementBatch.tsx`: review one management batch, update payments, and send reminders
- `src/pages/Payments.tsx`: unified ledger of paid electricity and management bills
- `src/pages/Users.tsx`: admin user management with add/edit/delete modal actions
- `src/pages/Settings.tsx`: company and WhatsApp configuration

## Desktop API Boundary

The renderer should not access Electron internals directly.
All real desktop operations go through `window.api`, which is defined by the preload layer.

The preload contract in `electron/preload.ts` mirrors the main process handlers:

- `auth`
- `tenants`
- `bills`
- `splits`
- `management`
- `payments`
- `users`
- `whatsapp`
- `settings`

If a renderer change needs data or persistence, first determine which IPC module owns the behavior.

## Data Model

### `users`

Stores application users and login state metadata.

Important fields:

- `email` unique
- `password_hash`
- `role` limited to `admin` or `staff`
- `must_change_password`

### `tenants`

Stores tenant identity and contact data.

Important fields:

- `room_no`
- `name`
- `phone`
- `email`
- `present_reading`
- `maintenance_fees`
- `generator_fees`
- `active`

### `bills`

Stores the monthly utility bill header.

Important fields:

- billing period month and year
- fixed unit and rate
- energy unit and rate
- extra, tax, and interest charges
- tax percentage
- other charges
- total
- split status is not stored on the bill row; the bills list reads `bill_splits.status`

There is a uniqueness constraint on `(period_month, period_year)`.

### `bill_splits`

Stores one split header per bill.

Important fields:

- `bill_id` unique
- `reading_date`
- `tax_rate`
- `status` with values `draft`, `finalized`, or `sent`

The bills list page reads `bill_splits.status` to display whether a split is pending or done.

### `tenant_bills`

Stores per-tenant allocation rows for a split.

Important fields:

- readings
- consumed units
- fixed, extra, tax, interest, and other charge calculations
- payment status and payment method
- payment date
- payable amount
- WhatsApp send metadata

There is a uniqueness constraint on `(bill_split_id, tenant_id)`.
`payment_status` defaults to `pending`, and `payment_method` is only meaningful when the bill is marked `paid`.
`payment_date` is only meaningful when the bill is marked `paid`.

### `management_bill_batches`

Stores management billing batches keyed by month and year.

Important fields:

- `period_month`
- `period_year`
- `status`

### `management_tenant_bills`

Stores per-tenant management fee rows for each batch.

Important fields:

- `maintenance_fees`
- `generator_fees`
- `total`
- `payment_status`
- `payment_method`
- `payment_date`
- `whatsapp_sent_at`

### `app_config`

Stores key/value app settings used by the settings page and WhatsApp flow.

## Main Process Responsibilities

### Database

`electron/db/client.ts` loads sql.js, opens or creates the SQLite file in Electron userData, applies migrations, and seeds the default admin user.

The database is persisted to:

- `billify.sqlite3` inside Electron `userData`

### Auth

`electron/services/auth.service.ts` keeps the current session in memory in the main process.
It verifies passwords with bcryptjs and returns a renderer-safe session object.

### Bills and splits

`electron/services/bill.service.ts`, `electron/services/tenant.service.ts`, `electron/services/split.service.ts`, `electron/services/management.service.ts`, `electron/services/payments.service.ts`, and `electron/services/pdf.service.ts` implement the core business operations.

`electron/services/bill.service.ts` stores bill totals, tax percentage, other charges, and joins `bill_splits` when listing bills for the status column.
`electron/services/tenant.service.ts` provides tenant bill history lookups, management bill lookups, and payment updates for the tenant detail page.
`electron/services/management.service.ts` manages management batch creation, listing, and payment updates.
`electron/services/payments.service.ts` returns the unified paid ledger for the payments page.
`electron/services/pdf.service.ts` exports tenant and management bill PDFs into bill-period-named subfolders inside the folder selected by the user.

The split flow is:

1. Create or load a `bill_splits` row for a bill.
2. Load active tenants.
3. Calculate allocations in `src/lib/calc.ts`.
4. Save draft rows into `tenant_bills`.
5. Sync each tenant's `present_reading` back to `tenants` so the next month can reuse it as the previous reading.
6. On finalize, persist tenant bill rows with default `pending` payment status and optional `cash`, `upi`, or `card` payment method.

### WhatsApp

`electron/services/whatsapp.service.ts` uploads PDFs and sends WhatsApp template messages through the Meta Graph API.
It also sends simple text reminders for pending tenant bills.
`electron/ipc/whatsapp.ipc.ts` assembles the data, generates PDFs, sends media, writes send metadata back to `tenant_bills`, sends reminder text messages, and marks the split as `sent`.

`electron/services/tenant.service.ts` and `electron/ipc/tenants.ipc.ts` also expose tenant bill payment updates for the tenant history page.

## Calculation Rules

`src/lib/calc.ts` is the shared split calculator.
It:

- computes consumption as `present_reading - previous_reading`
- allocates fixed, extra, and interest charges by consumption ratio
- computes energy charge from consumed units and the bill energy rate
- applies tax to fixed, energy, and extra totals only
- keeps interest and other charges outside the tax base
- rounds all values to 2 decimals
- returns reconciliation values for fixed, energy, extra, tax, interest, and other totals

The renderer uses the same calculator logic to show live split previews.
The main process uses the same logic before persisting draft rows.

### Browser fallback notes

`src/lib/browserApi.ts` mirrors the desktop data flow for Chrome testing.
It now assigns deterministic tenant-bill row IDs from the split ID and tenant ID so payment updates can target the correct row even when the browser state has been rebuilt from storage.
It also preserves tenant `present_reading` values, management batch rows, and split payment state when records are recalculated or updated, and it writes downloaded PDFs into the same bill-period-named subfolder shape as the desktop exporter.

## Settings and External Integration

Settings are stored in `app_config` and edited from `src/pages/Settings.tsx`.
Those settings feed the WhatsApp sender:

- `whatsapp_phone_number_id`
- `whatsapp_access_token`
- `whatsapp_electricity_bill_template`
- `whatsapp_electricity_reminder_template`
- `whatsapp_management_bill_template`
- `whatsapp_management_reminder_template`
- `whatsapp_template_language`

## Development Commands

- `npm run dev`: Electron desktop app
- `npm run dev:chrome`: Vite renderer in Chrome with browser fallback API
- `npm run build`: production Electron build
- `npm run preview`: Electron-Vite preview
- `npm run test`: Vitest test run

## Release Pipeline

- `.github/workflows/release.yml` builds Windows NSIS installers and publishes them to GitHub Releases when a `v*` tag is pushed.

## Important Invariants

- The desktop app is the source of truth for real data.
- The browser shim in `src/lib/browserApi.ts` is for Chrome testing and uses separate localStorage state.
- Browser-mode tenant bill rows need deterministic IDs so payment updates can be applied reliably.
- `window.api` must exist before pages call auth, bills, tenants, or settings methods.
- `bill_splits.bill_id` is one-to-one with a bill.
- Tenant bill payment status is `pending` by default and only uses a payment method/date when marked `paid`.
- Admin-only screens are `Users` and `Settings`.
- `must_change_password` forces the password setup route before normal navigation.

## When Changing Code

Before editing, identify the owning layer:

- UI changes belong in `src/`
- IPC wiring belongs in `electron/ipc/`
- business logic belongs in `electron/services/`
- persistence belongs in `electron/db/`
- renderer-only browser fallback changes belong in `src/lib/browserApi.ts`

If a change crosses layers, update the contract on both sides and keep the architecture doc in sync.
