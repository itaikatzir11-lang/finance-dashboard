/**
 * Excellence Trade Adapter
 *
 * Excellence Trade (אקסלנס טרייד) is a major Israeli brokerage
 * owned by Excellence Investments Ltd. They offer trading in Israeli TASE
 * securities and international markets.
 *
 * ── API Research Findings ────────────────────────────────────────────────────
 *
 * 1. extrpro.com (Excellence Pro — the professional trading platform):
 *    - No documented public REST API.
 *    - The web platform loads data via internal XHR calls but these are
 *      session-authenticated with short-lived tokens and undocumented.
 *    - Mobile app (iOS/Android) uses a private gRPC-like binary protocol.
 *    - Reverse engineering or scraping is against Excellence Trade's ToS.
 *
 * 2. excellencetrade.co.il (retail platform):
 *    - Also uses session-authenticated internal APIs (no public documentation).
 *    - No OAuth or API key system for third-party access.
 *
 * 3. Open banking (Israel):
 *    - The Bank of Israel's Directive 492 (open banking framework) is still
 *      being phased in as of 2025. Brokerages are not yet required to expose
 *      standardised APIs to third parties.
 *
 * 4. Israeli aggregators (Moneyman / Caspion / Max):
 *    - These services do support Excellence Trade via screen-scraping but
 *      require user credentials — not suitable for this app.
 *
 * Conclusion: No public or semi-public API is available.
 * Recommended workflow: CSV export from Excellence Trade → import here.
 * Price refresh: handled automatically via Yahoo Finance for listed symbols.
 *
 * ── CSV Format ───────────────────────────────────────────────────────────────
 * Date, Symbol, Type, Quantity, Price, Amount, Description
 */

import Papa from 'papaparse'
import type { AdapterResult, BalanceResult, BaseAdapter } from './types'
import type { ParsedTransaction, TransactionType } from '@/types'

export const isSupported = false
export const csvSupported = true

export interface ExcellenceTradeConfig {
  accountId?: string
}

interface RawCSVRow {
  Date?: string
  date?: string
  Symbol?: string
  symbol?: string
  SYMBOL?: string
  Type?: string
  type?: string
  TYPE?: string
  Quantity?: string
  quantity?: string
  QUANTITY?: string
  Price?: string
  price?: string
  PRICE?: string
  Amount?: string
  amount?: string
  AMOUNT?: string
  Description?: string
  description?: string
  DESCRIPTION?: string
  [key: string]: string | undefined
}

function normalizeRow(row: RawCSVRow): {
  date: string
  symbol: string
  type: string
  quantity: string
  price: string
  amount: string
  description: string
} {
  return {
    date: row.Date ?? row.date ?? row['תאריך'] ?? '',
    symbol: row.Symbol ?? row.symbol ?? row.SYMBOL ?? row['נייר ערך'] ?? '',
    type: row.Type ?? row.type ?? row.TYPE ?? row['סוג פעולה'] ?? '',
    quantity: row.Quantity ?? row.quantity ?? row.QUANTITY ?? row['כמות'] ?? '0',
    price: row.Price ?? row.price ?? row.PRICE ?? row['מחיר'] ?? '0',
    amount: row.Amount ?? row.amount ?? row.AMOUNT ?? row['סכום'] ?? '0',
    description: row.Description ?? row.description ?? row.DESCRIPTION ?? row['תיאור'] ?? '',
  }
}

function parseTransactionType(type: string): TransactionType {
  const t = type.trim().toUpperCase()
  if (t === 'BUY' || t === 'קנייה' || t === 'PURCHASE') return 'BUY'
  if (t === 'SELL' || t === 'מכירה' || t === 'SALE') return 'SELL'
  if (t === 'DEPOSIT' || t === 'הפקדה') return 'DEPOSIT'
  if (t === 'WITHDRAWAL' || t === 'משיכה') return 'WITHDRAWAL'
  if (t === 'DIVIDEND' || t === 'דיבידנד') return 'DIVIDEND'
  if (t === 'FEE' || t === 'עמלה') return 'FEE'
  if (t === 'TRANSFER' || t === 'העברה') return 'TRANSFER'
  return 'BUY'
}

function parseAmount(value: string): number {
  if (!value) return 0
  // Remove currency symbols, commas, spaces
  const cleaned = value.replace(/[₪$€,\s]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  // Try various date formats
  const cleaned = dateStr.trim()

  // DD/MM/YYYY (Israeli format)
  const ilMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ilMatch) {
    const [, day, month, year] = ilMatch
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString()
  }

  // MM/DD/YYYY (US format)
  const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    return new Date(cleaned).toISOString()
  }

  // ISO format
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) return d.toISOString()

  return new Date().toISOString()
}

export class ExcellenceTradeAdapter implements BaseAdapter {
  public readonly name = 'Excellence Trade'
  private readonly config: ExcellenceTradeConfig

  constructor(config: ExcellenceTradeConfig = {}) {
    this.config = config
  }

  /**
   * Direct API sync is not available.
   */
  async sync(): Promise<AdapterResult<void>> {
    return {
      success: false,
      error:
        'Direct API not available for Excellence Trade. ' +
        'Please use CSV import or manual entry. ' +
        'To export from Excellence Trade: Log in → Account → Activity → Export CSV.',
    }
  }

  /**
   * Balance not available via API.
   */
  async getBalance(): Promise<AdapterResult<BalanceResult>> {
    return {
      success: false,
      error:
        'Direct API not available for Excellence Trade. ' +
        'Please update your balance manually.',
    }
  }

  /**
   * Parse a CSV string from Excellence Trade export format.
   * Returns an array of parsed transactions.
   *
   * Expected columns (case-insensitive, English or Hebrew):
   * Date / תאריך, Symbol / נייר ערך, Type / סוג פעולה,
   * Quantity / כמות, Price / מחיר, Amount / סכום, Description / תיאור
   */
  parseCSV(csvContent: string): { transactions: ParsedTransaction[]; errors: string[]; totalParsed: number } {
    const errors: string[] = []
    const transactions: ParsedTransaction[] = []

    const result = Papa.parse<RawCSVRow>(csvContent.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    })

    if (result.errors.length > 0) {
      result.errors.forEach((err) => {
        errors.push(`Row ${err.row ?? '?'}: ${err.message}`)
      })
    }

    // Detect completely unrecognised format
    const headers = Object.keys(result.data[0] ?? {})
    const hasDateCol = headers.some((h) =>
      ['Date', 'date', 'תאריך'].includes(h)
    )
    if (result.data.length > 0 && !hasDateCol) {
      errors.push(
        `Unrecognised column headers: ${headers.slice(0, 5).join(', ')}. ` +
        'Expected Excellence Trade CSV with columns: Date, Symbol, Type, Quantity, Price, Amount.'
      )
      return { transactions, errors, totalParsed: result.data.length }
    }

    result.data.forEach((rawRow, index) => {
      try {
        const row = normalizeRow(rawRow)

        if (!row.date && !row.amount) {
          // Skip empty rows
          return
        }

        const amount = parseAmount(row.amount)
        const quantity = parseAmount(row.quantity)
        const price = parseAmount(row.price)
        const type = parseTransactionType(row.type || 'BUY')
        const date = parseDate(row.date)

        if (!row.date) {
          errors.push(`Row ${index + 2}: Missing date — row skipped`)
          return
        }

        transactions.push({
          date,
          symbol: row.symbol.toUpperCase().trim() || '',
          type,
          quantity,
          price,
          amount: type === 'BUY' || type === 'FEE' || type === 'WITHDRAWAL' ? -Math.abs(amount) : Math.abs(amount),
          description: row.description || `${type} ${row.symbol || ''}`.trim(),
        })
      } catch (err) {
        errors.push(`Row ${index + 2}: ${err instanceof Error ? err.message : 'Parse error'}`)
      }
    })

    return { transactions, errors, totalParsed: result.data.length }
  }

  /**
   * Get instructions for exporting CSV from Excellence Trade.
   */
  getImportInstructions(): string[] {
    return [
      '1. Log in to Excellence Trade at https://www.excellencetrade.co.il',
      '2. Navigate to "My Portfolio" → "Account Activity"',
      '3. Select the date range you want to export',
      '4. Click "Export" or "הורד" and choose CSV/Excel format',
      '5. Upload the file using the CSV Import tab below',
    ]
  }
}

export default ExcellenceTradeAdapter
