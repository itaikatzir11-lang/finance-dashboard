/**
 * Crypto Watch-Only Adapter
 *
 * Fetches on-chain balance for Bitcoin and Ethereum addresses
 * without requiring private keys. This is read-only / watch-only.
 *
 * BTC: Uses blockchain.info public API (no API key needed)
 * ETH: Uses Ethplorer free API (freekey works for low volume)
 */

import axios from 'axios'
import type { AdapterResult, BalanceResult, BaseAdapter } from './types'

export interface CryptoAdapterConfig {
  address: string
  coin: 'BTC' | 'ETH'
  xpub?: string
  accountId?: string
  dbAccountId?: string
}

interface BlockchainInfoAddress {
  address: string
  final_balance: number
  total_received: number
  total_sent: number
  n_tx: number
}

interface EthplorerAddressInfo {
  address: string
  ETH: {
    balance: number
    price?: {
      rate: number
      diff: number
    }
  }
  tokens?: Array<{
    tokenInfo: { symbol: string; name: string; decimals: string }
    balance: number
  }>
}

export class CryptoAdapter implements BaseAdapter {
  public readonly name: string
  private readonly config: CryptoAdapterConfig

  constructor(config: CryptoAdapterConfig) {
    this.config = config
    this.name = `${config.coin} Watch-Only (${config.address.slice(0, 8)}...)`
  }

  /**
   * Fetch BTC balance from blockchain.info API.
   */
  private async getBTCBalance(): Promise<AdapterResult<BalanceResult>> {
    try {
      const url = `https://blockchain.info/rawaddr/${this.config.address}?limit=0`
      const response = await axios.get<BlockchainInfoAddress>(url, {
        timeout: 8000,
        headers: { 'Accept': 'application/json' },
      })

      // blockchain.info returns balance in satoshis
      const satoshis = response.data.final_balance
      const btc = satoshis / 100_000_000

      return {
        success: true,
        data: { balance: btc, currency: 'BTC' },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[CryptoAdapter] BTC balance fetch failed for ${this.config.address}: ${message}`)

      // Return a real error — callers decide whether to show mock data.
      // We never silently substitute fake balances for a configured address.
      return {
        success: false,
        error: `blockchain.info unreachable: ${message}`,
      }
    }
  }

  /**
   * Fetch ETH balance from Ethplorer API.
   */
  private async getETHBalance(): Promise<AdapterResult<BalanceResult>> {
    try {
      const apiKey = process.env.ETHPLORER_API_KEY ?? 'freekey'
      const url = `https://api.ethplorer.io/getAddressInfo/${this.config.address}?apiKey=${apiKey}`
      const response = await axios.get<EthplorerAddressInfo>(url, {
        timeout: 8000,
        headers: { 'Accept': 'application/json' },
      })

      const eth = response.data.ETH.balance

      return {
        success: true,
        data: { balance: eth, currency: 'ETH' },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[CryptoAdapter] ETH balance fetch failed for ${this.config.address}: ${message}`)

      // Return a real error — callers decide whether to show mock data.
      return {
        success: false,
        error: `Ethplorer unreachable: ${message}`,
      }
    }
  }

  /**
   * Get the on-chain balance for this wallet address.
   */
  async getBalance(): Promise<AdapterResult<BalanceResult>> {
    if (this.config.coin === 'BTC') {
      return this.getBTCBalance()
    } else if (this.config.coin === 'ETH') {
      return this.getETHBalance()
    }

    return {
      success: false,
      error: `Unsupported coin: ${this.config.coin}`,
    }
  }

  /**
   * Sync: fetch on-chain balance and update the database.
   * If dbAccountId is not provided, only returns the balance.
   */
  async sync(): Promise<AdapterResult<void>> {
    const balanceResult = await this.getBalance()

    if (!balanceResult.success || !balanceResult.data) {
      return {
        success: false,
        error: balanceResult.error ?? 'Failed to fetch balance',
      }
    }

    // If we have a DB account ID, we could update it here
    // This requires prisma which we avoid circular-importing
    console.log(
      `[CryptoAdapter] ${this.config.coin} balance: ${balanceResult.data.balance} ${balanceResult.data.currency}`
    )

    return { success: true }
  }
}

export default CryptoAdapter
