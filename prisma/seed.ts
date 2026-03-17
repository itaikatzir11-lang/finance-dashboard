/**
 * Database seed — real holdings template
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  UPDATE THE VALUES BELOW TO MATCH YOUR ACTUAL HOLDINGS          │
 * │                                                                 │
 * │  Search for "UPDATE:" comments and edit each one.              │
 * │  Run: npm run db:seed  (wipes and re-seeds)                    │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Accounts pre-configured:
 *   - Discount Bank Checking (ILS, manual/CSV)
 *   - Trezor Crypto Wallet   (BTC + ETH, watch-only)
 *   - Excellence Trade       (brokerage, CSV import)
 *
 * Crypto addresses are read from BTC_ADDRESS / ETH_ADDRESS env vars.
 * If not set, a placeholder is stored (update via the Accounts page).
 */

import { PrismaClient } from '@prisma/client'
import { subDays, startOfDay } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  // Safety guard: don't wipe real data if accounts already exist.
  // Pass --force flag to override: npx ts-node prisma/seed.ts --force
  const existingCount = await prisma.account.count()
  const force = process.argv.includes('--force')

  if (existingCount > 0 && !force) {
    console.log(`⚠️  Database already has ${existingCount} account(s). Seed aborted.`)
    console.log('   To re-seed with sample data, run: npm run db:seed -- --force')
    console.log('   WARNING: --force will permanently delete all your real data.')
    return
  }

  console.log(force ? '⚠️  Force flag set — wiping existing data...' : 'Seeding database...')

  // Clean existing data
  await prisma.netWorthSnapshot.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.holding.deleteMany()
  await prisma.account.deleteMany()
  await prisma.priceCache.deleteMany()

  // Create accounts
  const bankAccount = await prisma.account.create({
    data: {
      name: 'Discount Bank Checking',
      type: 'BANK',
      currency: 'ILS',
      balance: 87500,
      lastSyncedAt: new Date(),
      isActive: true,
      metadata: {
        bankCode: '11',
        branchNumber: '123',
        accountNumber: '****4567',
        country: 'IL',
      },
    },
  })

  const cryptoAccount = await prisma.account.create({
    data: {
      // UPDATE: rename if you have separate BTC/ETH wallets
      name: 'Trezor – Crypto Wallet',
      type: 'CRYPTO',
      currency: 'USD',
      balance: 0,
      lastSyncedAt: new Date(),
      isActive: true,
      metadata: {
        // BTC operates in manual mode by default (quantity × live price).
        // To enable watch-only mode, set BTC_ADDRESS in .env — no need to re-seed.
        btcAddress: process.env.BTC_ADDRESS ?? null,
        // ETH is fully optional. Set ETH_ADDRESS in .env to enable.
        ethAddress: process.env.ETH_ADDRESS ?? null,
        // watchOnly is true only when an address is configured.
        watchOnly: !!(process.env.BTC_ADDRESS || process.env.ETH_ADDRESS),
      },
    },
  })

  const brokerageAccount = await prisma.account.create({
    data: {
      name: 'Excellence Trade',
      type: 'BROKERAGE',
      currency: 'USD',
      balance: 0,
      lastSyncedAt: new Date(),
      isActive: true,
      metadata: {
        broker: 'Excellence Trade',
        accountType: 'Individual',
        country: 'IL',
        csvSupported: true,
      },
    },
  })

  // Price cache
  const prices = [
    { symbol: 'AAPL', price: 189.30, currency: 'USD', changePercent24h: 1.24, source: 'yahoo' },
    { symbol: 'GOOGL', price: 178.15, currency: 'USD', changePercent24h: -0.87, source: 'yahoo' },
    { symbol: 'VOO', price: 492.50, currency: 'USD', changePercent24h: 0.53, source: 'yahoo' },
    { symbol: 'QQQ', price: 469.80, currency: 'USD', changePercent24h: 0.92, source: 'yahoo' },
    { symbol: 'VTI', price: 248.90, currency: 'USD', changePercent24h: 0.47, source: 'yahoo' },
    { symbol: 'BTC', price: 67450.00, currency: 'USD', changePercent24h: 2.31, source: 'coingecko' },
    { symbol: 'ETH', price: 3520.00, currency: 'USD', changePercent24h: 1.85, source: 'coingecko' },
    { symbol: 'ILS_CASH', price: 1.0, currency: 'ILS', changePercent24h: 0, source: 'manual' },
  ]

  for (const p of prices) {
    await prisma.priceCache.create({ data: p })
  }

  // -------------------------------------------------------------------------
  // Bank holdings
  // UPDATE: set quantity to your actual ILS balance
  // -------------------------------------------------------------------------
  const bankCash = await prisma.holding.create({
    data: {
      accountId: bankAccount.id,
      symbol: 'ILS_CASH',
      name: 'Israeli Shekel Cash',
      assetClass: 'CASH',
      quantity: 87500,          // UPDATE: your actual ILS balance
      avgCostBasis: 1.0,
      currentPrice: 1.0,
      currentValue: 87500,      // UPDATE: same as quantity
      dailyChangePercent: 0,
      currency: 'ILS',
      updatedAt: new Date(),
    },
  })

  // -------------------------------------------------------------------------
  // Crypto holdings
  // UPDATE: set quantity to your actual on-chain balances.
  // currentPrice will be updated automatically when you run Sync.
  // -------------------------------------------------------------------------
  const btcHolding = await prisma.holding.create({
    data: {
      accountId: cryptoAccount.id,
      symbol: 'BTC',
      name: 'Bitcoin',
      assetClass: 'CRYPTO',
      quantity: 0.85,           // UPDATE: your actual BTC balance
      avgCostBasis: 42000,      // UPDATE: your average cost per BTC (USD)
      currentPrice: 67450,      // will be refreshed on sync
      currentValue: 0.85 * 67450,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  const ethHolding = await prisma.holding.create({
    data: {
      accountId: cryptoAccount.id,
      symbol: 'ETH',
      name: 'Ethereum',
      assetClass: 'CRYPTO',
      quantity: 8.5,            // UPDATE: your actual ETH balance
      avgCostBasis: 2100,       // UPDATE: your average cost per ETH (USD)
      currentPrice: 3520,       // will be refreshed on sync
      currentValue: 8.5 * 3520,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  // -------------------------------------------------------------------------
  // Brokerage holdings — Excellence Trade
  // UPDATE: add/remove symbols to match your actual positions.
  // quantities, avgCostBasis, and currentPrice should reflect your real data.
  // Import transaction history via CSV to get accurate cost basis automatically.
  // -------------------------------------------------------------------------
  const aaplHolding = await prisma.holding.create({
    data: {
      accountId: brokerageAccount.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: 'STOCK',
      quantity: 50,             // UPDATE
      avgCostBasis: 155.0,      // UPDATE: your average cost (USD)
      currentPrice: 189.30,     // will be refreshed on sync
      currentValue: 50 * 189.30,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  const googlHolding = await prisma.holding.create({
    data: {
      accountId: brokerageAccount.id,
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      assetClass: 'STOCK',
      quantity: 30,             // UPDATE
      avgCostBasis: 140.0,      // UPDATE
      currentPrice: 178.15,
      currentValue: 30 * 178.15,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  const vooHolding = await prisma.holding.create({
    data: {
      accountId: brokerageAccount.id,
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      assetClass: 'ETF',
      quantity: 40,             // UPDATE
      avgCostBasis: 420.0,      // UPDATE
      currentPrice: 492.50,
      currentValue: 40 * 492.50,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  const qqqHolding = await prisma.holding.create({
    data: {
      accountId: brokerageAccount.id,
      symbol: 'QQQ',
      name: 'Invesco QQQ Trust',
      assetClass: 'ETF',
      quantity: 25,             // UPDATE
      avgCostBasis: 380.0,      // UPDATE
      currentPrice: 469.80,
      currentValue: 25 * 469.80,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  const vtiHolding = await prisma.holding.create({
    data: {
      accountId: brokerageAccount.id,
      symbol: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      assetClass: 'ETF',
      quantity: 60,             // UPDATE
      avgCostBasis: 215.0,      // UPDATE
      currentPrice: 248.90,
      currentValue: 60 * 248.90,
      dailyChangePercent: 0,
      currency: 'USD',
      updatedAt: new Date(),
    },
  })

  console.log('Created accounts and holdings')

  // Transactions - 20 spread over last 6 months
  const transactions = [
    {
      accountId: brokerageAccount.id,
      holdingId: aaplHolding.id,
      type: 'BUY' as const,
      symbol: 'AAPL',
      quantity: 50,
      price: 155.0,
      amount: -7750,
      currency: 'USD',
      description: 'Initial AAPL purchase',
      date: subDays(new Date(), 180),
      source: 'MANUAL' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: googlHolding.id,
      type: 'BUY' as const,
      symbol: 'GOOGL',
      quantity: 30,
      price: 140.0,
      amount: -4200,
      currency: 'USD',
      description: 'Initial GOOGL purchase',
      date: subDays(new Date(), 175),
      source: 'MANUAL' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: vooHolding.id,
      type: 'BUY' as const,
      symbol: 'VOO',
      quantity: 20,
      price: 420.0,
      amount: -8400,
      currency: 'USD',
      description: 'VOO first tranche',
      date: subDays(new Date(), 170),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: vooHolding.id,
      type: 'BUY' as const,
      symbol: 'VOO',
      quantity: 20,
      price: 435.0,
      amount: -8700,
      currency: 'USD',
      description: 'VOO second tranche',
      date: subDays(new Date(), 120),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: qqqHolding.id,
      type: 'BUY' as const,
      symbol: 'QQQ',
      quantity: 25,
      price: 380.0,
      amount: -9500,
      currency: 'USD',
      description: 'QQQ purchase',
      date: subDays(new Date(), 150),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: vtiHolding.id,
      type: 'BUY' as const,
      symbol: 'VTI',
      quantity: 60,
      price: 215.0,
      amount: -12900,
      currency: 'USD',
      description: 'VTI purchase',
      date: subDays(new Date(), 140),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: cryptoAccount.id,
      holdingId: btcHolding.id,
      type: 'BUY' as const,
      symbol: 'BTC',
      quantity: 0.5,
      price: 38000,
      amount: -19000,
      currency: 'USD',
      description: 'BTC accumulation',
      date: subDays(new Date(), 160),
      source: 'MANUAL' as const,
    },
    {
      accountId: cryptoAccount.id,
      holdingId: btcHolding.id,
      type: 'BUY' as const,
      symbol: 'BTC',
      quantity: 0.35,
      price: 46000,
      amount: -16100,
      currency: 'USD',
      description: 'BTC additional purchase',
      date: subDays(new Date(), 90),
      source: 'MANUAL' as const,
    },
    {
      accountId: cryptoAccount.id,
      holdingId: ethHolding.id,
      type: 'BUY' as const,
      symbol: 'ETH',
      quantity: 8.5,
      price: 2100,
      amount: -17850,
      currency: 'USD',
      description: 'ETH purchase',
      date: subDays(new Date(), 130),
      source: 'MANUAL' as const,
    },
    {
      accountId: bankAccount.id,
      type: 'DEPOSIT' as const,
      amount: 5000,
      currency: 'ILS',
      description: 'Monthly salary deposit',
      date: subDays(new Date(), 30),
      source: 'MANUAL' as const,
    },
    {
      accountId: bankAccount.id,
      type: 'DEPOSIT' as const,
      amount: 5000,
      currency: 'ILS',
      description: 'Monthly salary deposit',
      date: subDays(new Date(), 60),
      source: 'MANUAL' as const,
    },
    {
      accountId: bankAccount.id,
      type: 'DEPOSIT' as const,
      amount: 5000,
      currency: 'ILS',
      description: 'Monthly salary deposit',
      date: subDays(new Date(), 90),
      source: 'MANUAL' as const,
    },
    {
      accountId: bankAccount.id,
      type: 'WITHDRAWAL' as const,
      amount: -2000,
      currency: 'ILS',
      description: 'Wire transfer to brokerage',
      date: subDays(new Date(), 145),
      source: 'MANUAL' as const,
    },
    {
      accountId: brokerageAccount.id,
      type: 'DEPOSIT' as const,
      amount: 10000,
      currency: 'USD',
      description: 'Account funding',
      date: subDays(new Date(), 185),
      source: 'MANUAL' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: aaplHolding.id,
      type: 'DIVIDEND' as const,
      symbol: 'AAPL',
      amount: 46.0,
      currency: 'USD',
      description: 'AAPL quarterly dividend',
      date: subDays(new Date(), 45),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: vooHolding.id,
      type: 'DIVIDEND' as const,
      symbol: 'VOO',
      amount: 156.0,
      currency: 'USD',
      description: 'VOO quarterly dividend',
      date: subDays(new Date(), 50),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      type: 'FEE' as const,
      amount: -12.50,
      currency: 'USD',
      description: 'Brokerage monthly fee',
      date: subDays(new Date(), 15),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: brokerageAccount.id,
      type: 'FEE' as const,
      amount: -12.50,
      currency: 'USD',
      description: 'Brokerage monthly fee',
      date: subDays(new Date(), 45),
      source: 'CSV_IMPORT' as const,
    },
    {
      accountId: cryptoAccount.id,
      type: 'TRANSFER' as const,
      amount: -500,
      currency: 'USD',
      description: 'Transfer to cold wallet',
      date: subDays(new Date(), 20),
      source: 'MANUAL' as const,
    },
    {
      accountId: brokerageAccount.id,
      holdingId: googlHolding.id,
      type: 'BUY' as const,
      symbol: 'GOOGL',
      quantity: 5,
      price: 172.0,
      amount: -860,
      currency: 'USD',
      description: 'GOOGL top-up',
      date: subDays(new Date(), 10),
      source: 'MANUAL' as const,
    },
  ]

  for (const tx of transactions) {
    await prisma.transaction.create({ data: tx })
  }

  console.log('Created 20 transactions')

  // NetWorth Snapshots - 180 days simulating growth from ~250k to ~310k USD
  const startValue = 250000
  const endValue = 310000
  const days = 180

  for (let i = days; i >= 0; i--) {
    const progress = (days - i) / days
    // Simulate growth with some volatility
    const trend = startValue + (endValue - startValue) * progress
    const volatility = trend * 0.02 * (Math.sin(i * 0.3) + Math.cos(i * 0.15))
    const randomWalk = trend * 0.005 * (Math.random() - 0.5) * 2
    const totalValue = Math.max(trend + volatility + randomWalk, startValue * 0.9)

    const bankPct = 0.28 - progress * 0.03
    const cryptoPct = 0.22 + progress * 0.02
    const brokeragePct = 1 - bankPct - cryptoPct

    await prisma.netWorthSnapshot.create({
      data: {
        totalValue,
        breakdown: {
          bank: totalValue * bankPct,
          crypto: totalValue * cryptoPct,
          brokerage: totalValue * brokeragePct,
          cash: totalValue * bankPct,
        },
        createdAt: startOfDay(subDays(new Date(), i)),
      },
    })
  }

  console.log('Created 180 NetWorth snapshots')

  // Update account balances
  const cryptoValue = btcHolding.currentValue + ethHolding.currentValue
  await prisma.account.update({
    where: { id: cryptoAccount.id },
    data: { balance: cryptoValue },
  })

  const brokerageValue =
    aaplHolding.currentValue +
    googlHolding.currentValue +
    vooHolding.currentValue +
    qqqHolding.currentValue +
    vtiHolding.currentValue

  await prisma.account.update({
    where: { id: brokerageAccount.id },
    data: { balance: brokerageValue },
  })

  console.log('Seed complete!')
  console.log(`Bank: ILS 87,500`)
  console.log(`Crypto: $${cryptoValue.toFixed(2)}`)
  console.log(`Brokerage: $${brokerageValue.toFixed(2)}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
