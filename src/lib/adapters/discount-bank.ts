/**
 * Discount Bank Adapter
 *
 * Supports MANUAL balance entry and CSV_IMPORT modes.
 *
 * ── CSV Format ───────────────────────────────────────────────────────────────
 * Discount Bank exports account activity with these columns (Hebrew or English):
 *
 *   תאריך / Date         — transaction date (DD/MM/YYYY)
 *   פרטי פעולה / Details — description
 *   אסמכתא / Reference   — reference number (ignored)
 *   חובה / Debit         — money leaving the account (positive number)
 *   זכות / Credit        — money entering the account (positive number)
 *   יתרה / Balance       — running balance (ignored)
 */

import Papa from 'papaparse'
import type { AdapterResult, BalanceResult, BaseAdapter } from './types'
import type { ParsedTransaction } from '@/types'

export const isSupported = false
export const csvSupported = true

export interface DiscountBankConfig {
  accountId?: string
  lastFourDigits?: string
}

// ── CSV parsing helpers ───────────────────────────────────────────────────────

interface RawBankRow {
  [key: string]: string | undefined
}

function col(row: RawBankRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v.trim() !== '') return v.trim()
  }
  return ''
}

function parseAmount(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/[₪,\s\u00a0]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDate(dateStr: string): string {
  const cleaned = dateStr.trim()
  // DD/MM/YYYY (Israeli format)
  const ilMatch = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (ilMatch) {
    const day = parseInt(ilMatch[1], 10)
    const month = parseInt(ilMatch[2], 10)
    const year = parseInt(ilMatch[3], 10)
    // Validate bounds before constructing the Date — JS's Date constructor silently
    // wraps out-of-range values (e.g. 32/13/2024 → 2025-02-01), corrupting records.
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toISOString()
    }
  }
  // ISO or US format fallback
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function classifyTransaction(description: string, amount: number): ParsedTransaction['type'] {
  const desc = description.toLowerCase()
  if (desc.includes('משכורת') || desc.includes('salary') || desc.includes('שכר')) return 'DEPOSIT'
  if (desc.includes('העברה') || desc.includes('transfer')) return amount > 0 ? 'DEPOSIT' : 'TRANSFER'
  if (desc.includes('עמלה') || desc.includes('fee') || desc.includes('דמי')) return 'FEE'
  if (amount > 0) return 'DEPOSIT'
  return 'WITHDRAWAL'
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DiscountBankAdapter implements BaseAdapter {
  public readonly name = 'Discount Bank'
  private readonly config: DiscountBankConfig

  constructor(config: DiscountBankConfig = {}) {
    this.config = config
  }

  /**
   * Sync is not available — Discount Bank has no public API.
   * Returns step-by-step instructions for updating the balance manually.
   */
  async sync(): Promise<AdapterResult<void>> {
    const accountId = this.config.accountId
    const steps = [
      'Step 1: Log in to Discount Bank at https://www.discountbank.co.il',
      'Step 2: Go to "My Account" → "Account Activity" (פעולות בחשבון)',
      'Step 3: Note your current balance (יתרה) shown at the top',
      'Step 4: In FinDash, open the Accounts page and click the pencil icon next to this account',
      'Step 5: Enter the current balance in ILS and click Save',
      'Step 6: Optionally export a CSV and use the CSV Import tab to sync your transaction history',
    ]
    return {
      success: false,
      error: [
        'Discount Bank does not provide a public API for automatic sync.',
        ...steps,
      ].join('\n'),
      data: { instructions: steps, accountId },
    } as AdapterResult<void> & { data: { instructions: string[]; accountId?: string } }
  }

  /**
   * Balance retrieval is not available via API.
   */
  async getBalance(): Promise<AdapterResult<BalanceResult>> {
    return {
      success: false,
      error:
        'Discount Bank API not available. ' +
        'Please update your balance manually or use CSV import.',
    }
  }

  /**
   * Validates that the given balance is a finite, non-negative number.
   * Used to guard manual balance updates before persisting to DB.
   */
  validateBalance(amount: number): boolean {
    return Number.isFinite(amount) && amount >= 0
  }

  /**
   * Parse a CSV exported from Discount Bank's website.
   *
   * Supports both Hebrew and English column headers.
   * Each row has a Debit column (outgoing) and a Credit column (incoming).
   * Amount sign: credit = positive (money in), debit = negative (money out).
   */
  parseCSV(csvContent: string): { transactions: ParsedTransaction[]; errors: string[]; totalParsed: number; lastBalance?: number } {
    const errors: string[] = []
    const transactions: ParsedTransaction[] = []

    // Strip BOM if present (Discount Bank exports sometimes include UTF-8 BOM)
    const content = csvContent.replace(/^\uFEFF/, '').trim()

    const result = Papa.parse<RawBankRow>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/"/g, ''),
    })

    if (result.errors.length > 0) {
      result.errors.slice(0, 5).forEach((e) => {
        errors.push(`Row ${e.row ?? '?'}: ${e.message}`)
      })
    }

    // Detect completely unrecognised format
    const headers = Object.keys(result.data[0] ?? {})
    const hasDateCol = headers.some((h) =>
      ['תאריך', 'תאריך ערך', 'Date', 'date', 'Transaction Date'].includes(h)
    )
    if (result.data.length > 0 && !hasDateCol) {
      errors.push(
        `Unrecognised column headers: ${headers.slice(0, 5).join(', ')}. ` +
        'Expected Discount Bank CSV with columns: תאריך, פרטי פעולה, חובה, זכות.'
      )
      return { transactions, errors, totalParsed: result.data.length }
    }

    result.data.forEach((rawRow, index) => {
      try {
        // Date — Hebrew or English header
        const dateStr = col(rawRow,
          'תאריך', 'תאריך ערך', 'Date', 'date', 'Transaction Date'
        )
        if (!dateStr) return // skip header echoes or empty rows

        // Description
        const description = col(rawRow,
          'פרטי פעולה', 'פרטים', 'תיאור', 'Description', 'details', 'Details'
        )

        // Debit = money leaving account (positive number in the column)
        const debitStr = col(rawRow, 'חובה', 'Debit', 'debit', 'חיוב')
        // Credit = money entering account (positive number in the column)
        const creditStr = col(rawRow, 'זכות', 'Credit', 'credit', 'זיכוי')

        const debit = parseAmount(debitStr)
        const credit = parseAmount(creditStr)

        if (debit === 0 && credit === 0) return // balance-only or header row

        // Net amount: credit is positive (in), debit is negative (out)
        const amount = credit > 0 ? credit : -debit
        const type = classifyTransaction(description, amount)

        transactions.push({
          date: parseDate(dateStr),
          symbol: '',
          type,
          quantity: 0,
          price: 0,
          amount,
          description: description || (amount > 0 ? 'Deposit' : 'Withdrawal'),
        })
      } catch (err) {
        errors.push(`Row ${index + 2}: ${err instanceof Error ? err.message : 'Parse error'}`)
      }
    })

    // Extract last balance from the Balance column (יתרה) if present
    let lastBalance: number | undefined
    for (let i = result.data.length - 1; i >= 0; i--) {
      const balStr = col(result.data[i], 'יתרה', 'Balance', 'balance', 'יתרה חשבון')
      if (balStr) {
        const parsed = parseAmount(balStr)
        if (!isNaN(parsed)) { lastBalance = parsed; break }
      }
    }

    return { transactions, errors, totalParsed: result.data.length, lastBalance }
  }

  /**
   * Instructions for manual CSV export from Discount Bank website.
   */
  getImportInstructions(): string[] {
    return [
      '1. Log in to the Discount Bank website at https://www.discountbank.co.il',
      '2. Navigate to "My Account" → "Account Activity" (פעולות בחשבון)',
      '3. Select the desired date range',
      '4. Click "Export" (ייצוא) and choose CSV format',
      '5. Upload the downloaded file using the CSV Import feature below',
    ]
  }
}

export default DiscountBankAdapter
