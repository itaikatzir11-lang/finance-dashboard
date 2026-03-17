import { Header } from '@/components/layout/Header'
import { DBSetupBanner } from '@/components/dashboard/DBSetupBanner'
import { RefreshButton } from '@/components/dashboard/RefreshButton'
import { NetWorthCard } from '@/components/dashboard/NetWorthCard'
import { PortfolioHistoryChart } from '@/components/dashboard/PortfolioHistoryChart'
import { AllocationChart } from '@/components/dashboard/AllocationChart'
import { DailyChangeSummary } from '@/components/dashboard/DailyChangeSummary'
import { HoldingsTable } from '@/components/holdings/HoldingsTable'
import { TopHoldingsMini } from '@/components/dashboard/TopHoldingsMini'
import { DividendSummary } from '@/components/dashboard/DividendSummary'
import { AIInsightsPanel } from '@/components/dashboard/AIInsightsPanel'
import { DashboardKPIRow } from '@/components/dashboard/DashboardKPIRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Dashboard" />

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 space-y-8 lg:space-y-10">
        <DBSetupBanner />

        {/* Net Worth Summary — full width */}
        <NetWorthCard />

        {/* KPI quick-glance stats */}
        <DashboardKPIRow />

        {/* History + Allocation — 2/3 + 1/3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <PortfolioHistoryChart />
          </div>
          <div className="lg:col-span-1">
            <AllocationChart />
          </div>
        </div>

        {/* Daily movers + top holdings + dividend income */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DailyChangeSummary />

          <Card>
            <CardHeader>
              <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                Top Holdings by Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TopHoldingsMini />
            </CardContent>
          </Card>

          <DividendSummary />
        </div>

        {/* AI Portfolio Analysis */}
        <AIInsightsPanel />

        {/* Full holdings table */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">All Positions</h2>
            <a
              href="/holdings"
              className="text-[13px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View all →
            </a>
          </div>
          <HoldingsTable />
        </div>
      </main>
      <RefreshButton />
    </div>
  )
}
