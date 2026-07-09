'use client';

/**
 * BudgetOverview — the read-only "Overview" view of the Budget tab.
 * Renders the 3-KPI hero strip (Total Budget / Payments / Remaining),
 * the Regional Budget Summary mini-card grid, the Budget Overview
 * BarChart, the Regional Budget Allocation BarChart, and the two
 * Payment Methods charts (Distribution + Timeline).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` (Budget tab,
 * `paymentViewMode === 'graph'` branch) on 2026-06-02. Read-only:
 * pulls `campaign`, `campaignKOLs`, `payments` from
 * `useCampaignDetail()`. No setters, no internal state.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
} from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { CampaignService } from '@/lib/campaignService';
import { BRAND_HEX } from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { formatDate } from '@/lib/dateFormat';

export function BudgetOverview() {
  const { campaign, campaignKOLs, payments } = useCampaignDetail();

  if (!campaign) return null;

  return (
    <>
                  <div className="space-y-8">
                    {/* Budget Overview KPIs — Total / Paid / Remaining.
                        Converted from inline gradient tiles to the shared
                        KpiCard primitive so this hero strip reads with
                        the same rhythm as /dashboard, /lists, /analytics. */}
                    {(() => {
                      const paid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
                      // [2026-07-09] Total budget = sum of region allocations
                      // (fallback to the stored total_budget scalar when none),
                      // so the KPI reflects everything actually allocated.
                      const allocationsSum = (campaign.budget_allocations ?? []).reduce((s: number, a: any) => s + Number(a.allocated_budget ?? 0), 0);
                      const effectiveTotal = allocationsSum > 0 ? allocationsSum : (campaign.total_budget || 0);
                      const remaining = effectiveTotal - paid;
                      const paidPct = effectiveTotal > 0 ? (paid / effectiveTotal) * 100 : 0;
                      const remainPct = effectiveTotal > 0 ? (remaining / effectiveTotal) * 100 : 0;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <KpiCard
                            icon={DollarSign}
                            label="Total Budget"
                            value={CampaignService.formatCurrency(effectiveTotal)}
                            sub={campaign.budget_allocations && campaign.budget_allocations.length > 0
                              ? `${campaign.budget_allocations.length} regions allocated`
                              : 'Campaign allocation'}
                            accent="brand"
                          />
                          <KpiCard
                            icon={CreditCard}
                            label="Payments"
                            value={CampaignService.formatCurrency(paid)}
                            sub={`${paidPct.toFixed(1)}% of total budget`}
                            accent="sky"
                          />
                          <KpiCard
                            icon={CheckCircle2}
                            label="Remaining"
                            value={CampaignService.formatCurrency(remaining)}
                            sub={`${remainPct.toFixed(1)}% available`}
                            accent="emerald"
                          />
                        </div>
                      );
                    })()}

                    {/* Regional Budget Summary */}
                    {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
                      <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                        {/* Section header — same flex-row pattern as
                            Budget Overview / Regional Budget Allocation /
                            Payment Methods / Payment Timeline below, so
                            all 5 Budget-tab sections share one rhythm. */}
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Regional Budget Summary</h3>
                            <p className="text-sm text-ink-warm-500 mt-1">Allocation, payments, and remaining budget by region</p>
                          </div>
                          <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500 tabular-nums">
                            {campaign.budget_allocations.length} region{campaign.budget_allocations.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {campaign.budget_allocations.map((alloc: any) => {
                            // Helper function to map regions to APAC/Global
                            const mapRegionToCategory = (region: string) => {
                              const apacRegions = ['China', 'Korea', 'Vietnam', 'SEA', 'Philippines', 'apac'];
                              const globalRegions = ['Global', 'global'];
                              
                              if (apacRegions.includes(region)) return 'apac';
                              if (globalRegions.includes(region)) return 'global';
                              return region; // Keep other regions as is
                            };
                            
                            const kolsAllocated = campaignKOLs
                              .filter(kol => mapRegionToCategory(kol.master_kol.region || '') === alloc.region && kol.allocated_budget)
                              .reduce((sum, kol) => sum + (kol.allocated_budget || 0), 0);
                            
                            const actualPayments = payments
                              .filter(payment => {
                                const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                return kol && mapRegionToCategory(kol.master_kol.region || '') === alloc.region;
                              })
                              .reduce((sum, payment) => sum + (payment.amount || 0), 0);
                            
                            const remaining = alloc.allocated_budget - actualPayments;
                            const utilization = (actualPayments / alloc.allocated_budget) * 100;
                            
                            return (
                              <div key={alloc.region} className="bg-cream-50 p-4 rounded-[14px] border border-cream-200">
                                {/* Region header — display-serif title +
                                    mono uppercase utilization chip, matching
                                    the rest of the v11 KV mini-card surfaces
                                    (Record Payment per-KOL block, KOL cards-view). */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="display-serif text-[15px] text-ink-warm-900 leading-tight">
                                    {alloc.region === 'apac' ? 'APAC' : alloc.region === 'global' ? 'Global' : alloc.region}
                                  </div>
                                  <div className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500 tabular-nums">{utilization.toFixed(1)}% used</div>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Regional Budget</span>
                                    <span className="text-sm font-medium text-ink-warm-900 tabular-nums">{CampaignService.formatCurrency(alloc.allocated_budget)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Actual Payments</span>
                                    <span className="text-sm font-medium text-brand tabular-nums">{CampaignService.formatCurrency(actualPayments)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Remaining</span>
                                    <span className="text-sm font-medium text-emerald-600 tabular-nums">{CampaignService.formatCurrency(remaining)}</span>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <div className="w-full bg-cream-200 rounded-full h-2">
                                    <div
                                      className="bg-brand h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${Math.min(utilization, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Budget Overview Chart */}
                    <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Budget Overview</h3>
                          <p className="text-sm text-ink-warm-500 mt-1">Comparison of total budget vs actual payments</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-cream-300"></div>
                            <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Total</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-brand"></div>
                            <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Payments</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-emerald-500"></div>
                            <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Remaining</span>
                          </div>
                        </div>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              {
                                name: 'Budget Breakdown',
                                total: campaign.total_budget,
                                allocated: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
                                remaining: campaign.total_budget - payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
                              }
                            ]}
                            margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            barCategoryGap="40%"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 14, fill: '#64748b', fontWeight: 500 }}
                            />
                            <YAxis 
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: '#64748b' }}
                              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                fontSize: '14px'
                              }}
                              formatter={(value: number, name: string) => [
                                `$${value.toLocaleString()}`, 
                                name === 'total' ? 'Total Budget' : name === 'allocated' ? 'Allocated Budget' : 'Remaining Budget'
                              ]}
                              labelFormatter={() => ''}
                            />
                            <Bar dataKey="total" fill="#9ca3af" name="total" radius={[8, 8, 8, 8]} />
                            <Bar dataKey="allocated" fill={BRAND_HEX} name="allocated" radius={[8, 8, 8, 8]} />
                            <Bar dataKey="remaining" fill="#10b981" name="remaining" radius={[8, 8, 8, 8]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Regional Budget Allocation */}
                    {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
                      <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Regional Budget Allocation</h3>
                            <p className="text-sm text-ink-warm-500 mt-1">Budget distribution across regions</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-cream-300"></div>
                              <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Regional Budget</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-brand"></div>
                              <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Payments Made</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-emerald-500"></div>
                              <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Remaining</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={(() => {
                                // Helper function to map regions to APAC/Global
                                const mapRegionToCategory = (region: string) => {
                                  const apacRegions = ['China', 'Korea', 'Vietnam', 'SEA', 'Philippines', 'apac'];
                                  const globalRegions = ['Global', 'global'];
                                  
                                  if (apacRegions.includes(region)) return 'apac';
                                  if (globalRegions.includes(region)) return 'global';
                                  return region; // Keep other regions as is
                                };
                                
                                // Get all unique regions from both budget allocations and payments
                                const budgetRegions = (campaign.budget_allocations || []).map((alloc: any) => alloc.region);
                                const paymentRegions = payments
                                  .map(payment => {
                                    const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                    return mapRegionToCategory(kol?.master_kol.region || '');
                                  })
                                  .filter(Boolean);
                                const allRegions = Array.from(new Set([...budgetRegions, ...paymentRegions]));
                                
                                return allRegions.map(region => {
                                  const budgetAlloc = (campaign.budget_allocations || []).find((alloc: any) => alloc.region === region);
                                  const regionPayments = payments
                                    .filter(payment => {
                                      const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                      const mappedRegion = mapRegionToCategory(kol?.master_kol.region || '');
                                      return kol && mappedRegion === region;
                                    })
                                    .reduce((sum, payment) => sum + (payment.amount || 0), 0);
                                  
                                  return {
                                    region: region,
                                    allocated: budgetAlloc ? budgetAlloc.allocated_budget : 0,
                                    payments: regionPayments,
                                    remaining: (budgetAlloc ? budgetAlloc.allocated_budget : 0) - regionPayments
                                  };
                                });
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis 
                                dataKey="region" 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                tickFormatter={(value) => value === 'apac' ? 'APAC' : value === 'global' ? 'Global' : value}
                              />
                              <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number, name: string) => [
                                  `$${value.toLocaleString()}`, 
                                  name === 'allocated' ? 'Regional Budget' : name === 'payments' ? 'Payments Made' : 'Remaining'
                                ]}
                                labelFormatter={(label: string) => {
                                  return label === 'apac' ? 'APAC' : label === 'global' ? 'Global' : label;
                                }}
                              />
                              <Bar dataKey="allocated" fill="#9ca3af" name="allocated" radius={[8, 8, 8, 8]} />
                              <Bar dataKey="payments" fill={BRAND_HEX} name="payments" radius={[8, 8, 8, 8]} />
                              <Bar dataKey="remaining" fill="#10b981" name="remaining" radius={[8, 8, 8, 8]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Payment Charts Row */}
                    {payments.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payment Methods Distribution */}
                        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Payment Methods Distribution</h3>
                              <p className="text-sm text-ink-warm-500 mt-1">Breakdown of payments by method</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#8b5cf6]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Token</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#f59e0b]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Fiat</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#10b981]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">WL</span>
                              </div>
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={(() => {
                                  // Group payments by payment method and sum amounts
                                  const paymentMethods = payments.reduce((acc, payment) => {
                                    const method = payment.payment_method || 'Unknown';
                                    if (!acc[method]) {
                                      acc[method] = 0;
                                    }
                                    acc[method] += payment.amount || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  // Convert to array format for chart
                                  return Object.entries(paymentMethods).map(([method, amount]) => ({
                                    method: method,
                                    amount: amount
                                  }));
                                })()}
                                margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis 
                                  dataKey="method" 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                />
                                <YAxis 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b' }}
                                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    fontSize: '14px'
                                  }}
                                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Amount']}
                                  labelFormatter={(label: string) => label}
                                />
                                <Bar 
                                  dataKey="amount" 
                                  radius={[8, 8, 0, 0]}
                                >
                                  {(() => {
                                    // Group payments by payment method and sum amounts
                                    const paymentMethods = payments.reduce((acc, payment) => {
                                      const method = payment.payment_method || 'Unknown';
                                      if (!acc[method]) {
                                        acc[method] = 0;
                                      }
                                      acc[method] += payment.amount || 0;
                                      return acc;
                                    }, {} as Record<string, number>);

                                    // Convert to array format for chart
                                    const chartData = Object.entries(paymentMethods).map(([method, amount]) => ({
                                      method: method,
                                      amount: amount
                                    }));

                                    return chartData.map((entry, index) => {
                                      let color = '#8b5cf6'; // Default purple
                                      if (entry.method === 'Token') color = '#8b5cf6'; // Purple
                                      else if (entry.method === 'Fiat') color = '#f59e0b'; // Amber
                                      else if (entry.method === 'WL') color = '#10b981'; // Emerald
                                      
                                      return (
                                        <Cell key={`cell-${index}`} fill={color} />
                                      );
                                    });
                                  })()}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Payment Timeline Chart */}
                        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Payment Timeline</h3>
                              <p className="text-sm text-ink-warm-500 mt-1">Payment amounts over time by method</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#8b5cf6]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Token</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#f59e0b]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">Fiat</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#10b981]"></div>
                                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-700">WL</span>
                              </div>
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={(() => {
                                  // Group payments by date and payment method
                                  const paymentsByDate = payments.reduce((acc, payment) => {
                                    const date = formatDate(payment.payment_date);
                                    
                                    if (!acc[date]) {
                                      acc[date] = {
                                        date: date,
                                        Token: 0,
                                        Fiat: 0,
                                        WL: 0
                                      };
                                    }
                                    
                                    const method = payment.payment_method || 'Token';
                                    acc[date][method] += payment.amount || 0;
                                    
                                    return acc;
                                  }, {} as Record<string, any>);

                                  // Convert to array and sort by date
                                  return Object.values(paymentsByDate).sort((a: any, b: any) => {
                                    const dateA = new Date(a.date);
                                    const dateB = new Date(b.date);
                                    return dateA.getTime() - dateB.getTime();
                                  });
                                })()}
                                margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                />
                                <YAxis 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b' }}
                                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    fontSize: '14px'
                                  }}
                                  formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
                                  labelFormatter={(label: string) => `Payment Date: ${label}`}
                                />
                                <Line type="monotone" dataKey="Token" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }} />
                                <Line type="monotone" dataKey="Fiat" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }} />
                                <Line type="monotone" dataKey="WL" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
    </>
  );
}
