// Enums
export type AccountType = 'BANK' | 'CRYPTO' | 'BROKERAGE' | 'PENSION'
export type AssetClass = 'STOCK' | 'ETF' | 'CRYPTO' | 'CASH' | 'BOND' | 'OTHER'
export type TransactionType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'FEE' | 'TRANSFER'
export type TransactionSource = 'MANUAL' | 'CSV_IMPORT' | 'API'

// Core interfaces
export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  lastSyncedAt: string | null
  isActive: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  holdings?: Holding[]
  transactions?: Transaction[]
}

export interface Holding {
  id: string
  accountId: string
  symbol: string
  name: string
  assetClass: AssetClass
  quantity: number
  avgCostBasis: number | null
  currentPrice: number
  currentValue: number
  dailyChangePercent: number
  currency: string
  metadata: Record<string, unknown>
  updatedAt: string
  account?: Account
}

export interface Transaction {
  id: string
  accountId: string
  holdingId: string | null
  type: TransactionType
  symbol: string | null
  quantity: number | null
  price: number | null
  amount: number
  currency: string
  description: string | null
  date: string
  importedAt: string | null
  source: TransactionSource
  metadata: Record<string, unknown>
  createdAt: string
  account?: Account
  holding?: Holding | null
}

export interface NetWorthSnapshot {
  id: string
  totalValue: number
  breakdown: NetWorthBreakdown
  createdAt: string
}

export interface PriceCache {
  id: string
  symbol: string
  price: number
  currency: string
  changePercent24h: number
  source: string
  fetchedAt: string
}

// UI / aggregated types
export interface NetWorthBreakdown {
  cash: number
  crypto: number
  capitalMarket: number
  pension: number
  /** Brokerage uninvested cash — subset of `cash`. Used to show Bank vs Brokerage split. */
  brokerageCash?: number
}

export interface NetWorthSummary {
  total: number
  breakdown: NetWorthBreakdown
  dailyChange: number
  dailyChangePercent: number
  dataSource?: 'db' | 'mock'
}

export interface HoldingsResponse {
  data: HoldingWithAccount[]
  dataSource: 'db' | 'mock'
}

export interface AccountsResponse {
  data: AccountWithStats[]
  dataSource: 'db' | 'mock'
}

export interface AllocationData {
  name: string
  value: number
  color: string
  percent: number
}

export interface HistoryPoint {
  date: string
  value: number
}

export interface HoldingWithAccount extends Holding {
  account: Account
}

export interface TransactionWithRelations extends Transaction {
  account: Account
  holding?: Holding | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SyncResult {
  success: boolean
  message: string
  error?: string
  accountId?: string
}

export interface RowError {
  row: number
  message: string
}

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  /** General / system-level messages (warnings, notes, fallbacks) */
  errors: string[]
  /** Per-row parse failures with the original CSV row number */
  rowErrors: RowError[]
}

export interface AccountWithStats extends Account {
  holdingCount: number
  totalValue: number
}

export interface ParsedTransaction {
  date: string
  symbol: string
  type: TransactionType
  quantity: number
  price: number
  amount: number
  description: string
}
