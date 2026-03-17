import axios from 'axios'

export interface PriceResult {
  symbol: string
  price: number
  changePercent24h: number
  currency: string
  source: string
  name?: string  // company/asset name if resolved from API
}

// Mock prices as fallback when APIs are unavailable
export const MOCK_PRICES: Record<string, PriceResult> = {
  AAPL:  { symbol: 'AAPL',  price: 189.30,   changePercent24h: 1.24,  currency: 'USD', source: 'mock' },
  GOOGL: { symbol: 'GOOGL', price: 178.15,   changePercent24h: -0.87, currency: 'USD', source: 'mock' },
  VOO:   { symbol: 'VOO',   price: 492.50,   changePercent24h: 0.53,  currency: 'USD', source: 'mock' },
  QQQ:   { symbol: 'QQQ',   price: 469.80,   changePercent24h: 0.92,  currency: 'USD', source: 'mock' },
  VTI:   { symbol: 'VTI',   price: 248.90,   changePercent24h: 0.47,  currency: 'USD', source: 'mock' },
  BTC:   { symbol: 'BTC',   price: 67450.00, changePercent24h: 2.31,  currency: 'USD', source: 'mock' },
  ETH:   { symbol: 'ETH',   price: 3520.00,  changePercent24h: 1.85,  currency: 'USD', source: 'mock' },
  ILS_CASH: { symbol: 'ILS_CASH', price: 1.0, changePercent24h: 0, currency: 'ILS', source: 'mock' },
}

/**
 * Fetch stock price from a specific Yahoo Finance domain.
 * Yahoo Finance sometimes rate-limits query1 but not query2, so we try both.
 */
async function fetchFromYahooUrl(url: string): Promise<PriceResult | null> {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    const result = response.data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta
    const currentPrice: number = meta.regularMarketPrice ?? meta.previousClose
    if (!currentPrice || currentPrice <= 0) return null

    const previousClose: number = meta.chartPreviousClose ?? meta.previousClose
    const changePercent24h =
      previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0

    return {
      symbol: meta.symbol ?? '',
      price: currentPrice,
      changePercent24h,
      currency: meta.currency ?? 'USD',
      source: 'yahoo',
      name: meta.longName ?? meta.shortName ?? undefined,
    }
  } catch {
    return null
  }
}

/**
 * Fetch stock price from Yahoo Finance for a specific ticker string.
 * Tries query1 first, then falls back to query2 if rate-limited.
 * Returns null if the ticker is not found or both domains fail.
 */
async function fetchFromYahoo(ticker: string): Promise<PriceResult | null> {
  const path = `/v8/finance/chart/${ticker}?interval=1d&range=2d`
  const result = await fetchFromYahooUrl(`https://query1.finance.yahoo.com${path}`)
  if (result) return result
  // query1 failed — try query2 (Yahoo sometimes rate-limits one domain but not the other)
  return fetchFromYahooUrl(`https://query2.finance.yahoo.com${path}`)
}

/**
 * Fetch stock price from Yahoo Finance.
 * Tries the symbol as-is first, then with .TA suffix for Israeli TASE stocks.
 * Returns the original symbol in the result regardless of which ticker worked.
 */
export async function fetchStockPrice(symbol: string): Promise<PriceResult> {
  // If the symbol already has an exchange suffix (e.g. "TEVA.TA"), try as-is only
  if (symbol.includes('.')) {
    const result = await fetchFromYahoo(symbol)
    if (result) return result
    return MOCK_PRICES[symbol] ?? { symbol, price: 0, changePercent24h: 0, currency: 'USD', source: 'mock' }
  }

  // Pure-digit symbols (e.g. Israeli security IDs like "1159235") are TASE-only —
  // skip the plain lookup and go straight to the .TA suffix.
  if (/^\d+$/.test(symbol)) {
    const taseOnly = await fetchFromYahoo(`${symbol}.TA`)
    if (taseOnly) return { ...taseOnly, symbol, currency: taseOnly.currency ?? 'ILS' }
    return MOCK_PRICES[symbol] ?? { symbol, price: 0, changePercent24h: 0, currency: 'ILS', source: 'mock' }
  }

  // Try the plain symbol first (covers NYSE/NASDAQ cross-listed Israeli stocks like TEVA, NICE, WIX)
  const plain = await fetchFromYahoo(symbol)
  if (plain) return { ...plain, symbol } // restore caller's symbol

  // Retry with .TA suffix for Tel Aviv Stock Exchange (TASE) stocks
  const tase = await fetchFromYahoo(`${symbol}.TA`)
  if (tase) return { ...tase, symbol, currency: tase.currency ?? 'ILS' }

  // Both failed — return mock
  return MOCK_PRICES[symbol] ?? { symbol, price: 0, changePercent24h: 0, currency: 'USD', source: 'mock' }
}

/**
 * Fetch crypto price from CoinGecko free API.
 * Supports BTC and ETH by default.
 */
export async function fetchCryptoPrice(symbol: string): Promise<PriceResult> {
  const coinMap: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    BNB: 'binancecoin',
    ADA: 'cardano',
  }

  const coinId = coinMap[symbol.toUpperCase()]
  if (!coinId) {
    return MOCK_PRICES[symbol] ?? { symbol, price: 0, changePercent24h: 0, currency: 'USD', source: 'mock' }
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'Accept': 'application/json' },
    })

    const data = response.data?.[coinId]
    if (!data) throw new Error('No data returned')

    return {
      symbol,
      price: data.usd,
      changePercent24h: data.usd_24h_change ?? 0,
      currency: 'USD',
      source: 'coingecko',
    }
  } catch {
    return MOCK_PRICES[symbol] ?? { symbol, price: 0, changePercent24h: 0, currency: 'USD', source: 'mock' }
  }
}

/**
 * Determine if a symbol is crypto.
 */
function isCrypto(symbol: string): boolean {
  return ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'XRP', 'DOGE', 'AVAX'].includes(symbol.toUpperCase())
}

/**
 * Fetch price for any symbol (routes to appropriate API).
 */
export async function fetchPrice(symbol: string): Promise<PriceResult> {
  if (symbol === 'ILS_CASH') {
    return { symbol, price: 1.0, changePercent24h: 0, currency: 'ILS', source: 'manual' }
  }
  if (isCrypto(symbol)) {
    return fetchCryptoPrice(symbol)
  }
  return fetchStockPrice(symbol)
}

// Price cache TTL: skip external API if cached data is fresher than this
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch prices for multiple symbols and upsert into PriceCache table.
 * Skips external API calls for symbols whose cache entry is still fresh.
 * Accepts the prisma client to avoid circular imports.
 */
export async function updatePriceCache(
  symbols: string[],
  prismaClient: Pick<import('@prisma/client').PrismaClient, 'priceCache'>
): Promise<PriceResult[]> {
  const results: PriceResult[] = []

  // Load all existing cache entries up-front (single query)
  let cacheMap: Map<string, { price: number; changePercent24h: number; currency: string; source: string; fetchedAt: Date }> = new Map()
  try {
    const cached = await prismaClient.priceCache.findMany({
      where: { symbol: { in: symbols } },
    })
    for (const row of cached) {
      cacheMap.set(row.symbol, row)
    }
  } catch {
    // DB unavailable — proceed without cache
  }

  const now = Date.now()
  const symbolsToFetch = symbols.filter((s) => {
    const cached = cacheMap.get(s)
    return !cached || now - cached.fetchedAt.getTime() >= PRICE_CACHE_TTL_MS
  })

  // Return stale/cached results for symbols that don't need a refresh
  for (const s of symbols) {
    if (!symbolsToFetch.includes(s)) {
      const cached = cacheMap.get(s)!
      results.push({ symbol: s, price: cached.price, changePercent24h: cached.changePercent24h, currency: cached.currency, source: cached.source })
    }
  }

  if (symbolsToFetch.length === 0) return results

  // Fetch prices with small concurrency limit to avoid rate limiting
  const batchSize = 3
  for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
    const batch = symbolsToFetch.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(fetchPrice))

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const priceData = result.value
        results.push(priceData)

        try {
          await prismaClient.priceCache.upsert({
            where: { symbol: priceData.symbol },
            update: {
              price: priceData.price,
              currency: priceData.currency,
              changePercent24h: priceData.changePercent24h,
              source: priceData.source,
              fetchedAt: new Date(),
            },
            create: {
              symbol: priceData.symbol,
              price: priceData.price,
              currency: priceData.currency,
              changePercent24h: priceData.changePercent24h,
              source: priceData.source,
              fetchedAt: new Date(),
            },
          })
        } catch {
          // DB might not be available, that's ok
        }
      }
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < symbolsToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

/**
 * Get prices for multiple symbols. Returns mock data for symbols not found.
 */
export async function getPrices(symbols: string[]): Promise<Record<string, PriceResult>> {
  const results: Record<string, PriceResult> = {}

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      const price = await fetchPrice(symbol)
      results[symbol] = price
    })
  )

  return results
}
