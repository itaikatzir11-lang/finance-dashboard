# Finance Dashboard (FinDash)

Personal finance dashboard for tracking investments across Israeli bank accounts, crypto wallets, and brokerage accounts.

## Dev Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run db:push      # Apply Prisma schema to DB (no migrations)
npm run db:seed      # Seed DB with sample data
npm run db:studio    # Open Prisma Studio GUI
```

## Tech Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **PostgreSQL** + **Prisma 5** ORM
- **Tailwind CSS** + **Shadcn UI** components
- **Recharts** for charts
- **PapaParse** for CSV parsing
- Path alias: `@/*` → `src/*`

## Project Structure

```
src/
  app/
    api/              # Next.js API routes (backend)
      accounts/       # CRUD for accounts
      holdings/       # Portfolio positions
      net-worth/      # Aggregated portfolio value
      snapshots/      # Historical net worth
      transactions/   # Transactions + CSV import endpoint
      sync/           # Trigger data sync
      status/         # Data source connection status
    accounts/         # Accounts page
    analytics/        # Analytics page
    holdings/         # Holdings page
    status/           # Status/connections page
    transactions/     # Transactions page (3 tabs)
    layout.tsx        # Root layout with sidebar
    page.tsx          # Main dashboard
  components/
    dashboard/        # NetWorthCard, PortfolioHistoryChart, AllocationChart, etc.
    holdings/         # HoldingsTable
    layout/           # Sidebar, Header
    transactions/     # TransactionsTable, CSVImport, ManualEntryForm
    ui/               # Shadcn UI primitives
  lib/
    adapters/         # Data source adapters (crypto, discount-bank, excellence-trade)
    market-data.ts    # Stock & crypto price fetching
    mock-data.ts      # Fallback mock data (single source of truth)
    prisma.ts         # Prisma client singleton
    utils.ts          # Formatting utilities (cn, formatCurrency, etc.)
  types/
    index.ts          # All TypeScript types & interfaces
prisma/
  schema.prisma       # DB schema
  seed.ts             # Seed script
```

## Database Schema

**Models:** `Account`, `Holding`, `Transaction`, `NetWorthSnapshot`, `PriceCache`

**Enums:**
- `AccountType`: `BANK | CRYPTO | BROKERAGE`
- `AssetClass`: `STOCK | ETF | CRYPTO | CASH | BOND | OTHER`
- `TransactionType`: `BUY | SELL | DEPOSIT | WITHDRAWAL | DIVIDEND | FEE | TRANSFER`
- `TransactionSource`: `MANUAL | CSV_IMPORT | API`

## Data Sources & Adapters

| Account Type | Source | Method |
|---|---|---|
| Discount Bank (BANK) | CSV export | Manual import via UI |
| Excellence Trade (BROKERAGE) | CSV export | Manual import via UI |
| Bitcoin/Trezor (CRYPTO) | blockchain.info + CoinGecko | Watch-only or manual |
| Ethereum (CRYPTO) | Ethplorer + CoinGecko | Watch-only or manual |
| Stock prices | Yahoo Finance (unofficial) | Auto on `/api/sync` |
| Crypto prices | CoinGecko free tier | Auto on `/api/sync` |

Adapters live in `src/lib/adapters/` and implement a common interface from `types.ts`.

## Environment Variables

```bash
# Required
DATABASE_URL="postgresql://postgres:password@localhost:5432/finance_dashboard"

# Crypto watch-only (optional - enables auto-sync mode)
BTC_ADDRESS=        # bc1q..., 1..., or 3...
ETH_ADDRESS=        # 0x...

# API keys (optional)
ETHPLORER_API_KEY=freekey
ALPHA_VANTAGE_API_KEY=

# Currency
ILS_USD_RATE=0.27   # Override ILS→USD rate

# Dev
FORCE_MOCK_DATA=false
```

## Key Patterns

**Graceful degradation:** All API routes catch DB errors and return mock data from `src/lib/mock-data.ts`. Never throw unhandled errors to the client.

**Watch-only crypto:** BTC/ETH balances fetched from public blockchain APIs — no private keys ever stored. If env var address not set, falls back to manual mode (quantity stored in DB).

**CSV import flow:** User downloads CSV from bank/broker → uploads via `/transactions` page → `POST /api/transactions/import` → PapaParse → bulk DB insert.

**Price caching:** Prices stored in `PriceCache` model to avoid rate limiting. Always check cache before fetching externally.

**Net worth snapshots:** Created automatically during `/api/sync` calls. Used to power the portfolio history chart.

**State management:** Lightweight — `useState` + `useEffect` + direct `fetch()`. No Redux or Zustand.

## Conventions

- Currency display: ILS accounts shown in ₪, converted to USD for totals
- All monetary values stored as `Float` in DB (no cents/integer storage)
- Component files use `.tsx`, lib files use `.ts`
- API routes: one `route.ts` per folder, export named HTTP methods (`GET`, `POST`)
- Mock data in `src/lib/mock-data.ts` must stay consistent across all endpoints

## Do Not

- Store private keys or seed phrases anywhere in the codebase
- Break the mock data fallback — it must always return valid-shaped data
- Use `any` type — prefer proper TypeScript types from `src/types/index.ts`
- Add external APIs that require paid keys as a hard dependency
