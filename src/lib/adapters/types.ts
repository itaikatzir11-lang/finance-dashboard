export interface AdapterResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface BalanceResult {
  balance: number
  currency: string
}

export interface BaseAdapter {
  name: string
  sync(): Promise<AdapterResult<void>>
  getBalance(): Promise<AdapterResult<BalanceResult>>
}
