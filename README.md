# Static OS

Cocktail-bar COGS operations platform built with Next.js and Supabase.

Slice 0 provides:

- Email/password authentication
- Organization and location tenancy with Row Level Security
- Manager and staff roles
- Private, tenant-scoped source-document storage
- Manager desktop navigation and staff mobile task navigation
- Unit, database, and browser test harnesses

Slice 2 adds:

- Full and spot inventory count setup by storage walk order
- Staff mobile count entry with open-bottle tenths
- Optional expected-quantity reveal during counting
- Manager variance review, recount requests, and line/all approval
- Idempotent opening-balance and count-adjustment ledger posting
- On-hand quantity, weighted-average valuation, and negative-stock exceptions

Slice 3 adds:

- Vendor order guides with pars, packs, current cost, and suggested quantities
- Draft, approval, vendor-output, sent, partial, and received PO states
- Staff receive-all and quantity-adjusted receiving with exception review
- Manager-reviewed no-PO deliveries
- Invoice staging, duplicate and price/pack/total anomaly checks
- Receipt posting and invoice revaluation through moving weighted-average cost

Slice 4 adds:

- Effective-dated menu, prep, and batch recipe versions
- Purchased-item and cycle-safe nested recipe components
- Durable Toast menu GUID mappings
- Staff prep production with value-conserving ledger posting
- Explicit planned-versus-actual yield variance
- Idempotent Toast PMIX sales business-day posting
- Nested theoretical ingredient quantity and cost without physical stock changes

## Local setup

Requirements:

- Node.js 20 or newer
- Docker Desktop
- Supabase CLI

Install dependencies and start Supabase:

```bash
npm install
npm run supabase:start -- --ignore-health-check
```

Static OS uses the `5532x` port range so it can run beside other local Supabase
projects. Copy `.env.example` to `.env.local`, then fill the publishable and
secret keys shown by:

```bash
npx supabase status
```

Reset migrations and seed data:

```bash
npm run supabase:reset
```

Start the app:

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Seeded users

| Role    | Email                | Password       |
| ------- | -------------------- | -------------- |
| Manager | manager@static.local | `StaticOS123!` |
| Staff   | staff@static.local   | `StaticOS123!` |

These credentials are local-development fixtures only.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx supabase db lint --local --fail-on warning
npx supabase test db
npm run format:check
```

Playwright is optional and is not part of routine gates. When explicitly
needed, `npm run test:e2e` starts an isolated development server on port `3100`.

## Opening inventory workflow

1. Sign in as the manager and open `/inventory/counts/new`.
2. Assign storage zones to the seeded staff user.
3. Sign in as staff and complete `/count`, including bottle tenths where
   applicable.
4. Return as manager to the generated review URL.
5. Approve individual lines or request recounts, then approve and post the
   completed count.
6. Review `/inventory/on-hand` and
   `/exceptions/negative-inventory`.

## Purchasing and receiving workflow

1. Review vendor pars and current cost at `/purchasing/order-guide`.
2. Open `/purchasing/suggested-order`, adjust quantities, and create a draft
   purchase order.
3. Approve the PO, open its vendor output, and mark it sent.
4. Sign in as staff and receive the delivery at `/receive`. Clean receipts post
   immediately; shortages, substitutions, damage, price mismatches, unknown
   items, and no-PO deliveries wait at `/receiving/review`.
5. Register an extracted invoice at `/invoices/upload`, inspect anomaly flags,
   and approve it from the invoice review page.
6. Confirm the receipt quantity and latest weighted-average cost at
   `/inventory/on-hand`.

## Recipes, production, and theoretical usage

1. Create a draft recipe at `/recipes/new` with its first component and output
   yield.
2. Add remaining components at `/recipes/<recipe-id>`, then activate the
   version. Activation rejects missing components, overlapping dates, and
   dependency cycles.
3. Resolve staged Toast menu GUIDs at `/recipes/mappings`.
4. Sign in as staff and post a prep or batch yield at `/production`. Production
   consumes the planned component quantity and creates actual output at equal
   total value.
5. Upload and stage a Toast PMIX source file through `/imports`, then post the
   mapped business day at `/recipes/sales`.
6. Review purchased-item expansion and theoretical cost at
   `/recipes/theoretical-usage`. Sales usage is analytical and does not change
   physical on-hand.

## Database workflow

- Migrations live in `supabase/migrations/` and use timestamp prefixes.
- Local seed data lives in `supabase/seed.sql`.
- Database integration tests live in `supabase/tests/database/`.
- Source documents use the private `source-documents` bucket.
- Storage object paths must begin with
  `<organization-id>/<location-id>/`.

The hosted Supabase project and Vercel deployment are intentionally not linked
in source control; configure those environments with their own secrets.
