import { useEffect, useMemo, useState } from 'react';
import {
  Chart,
  ChartCategoryAxis,
  ChartCategoryAxisItem,
  ChartLegend,
  ChartSeries,
  ChartSeriesItem,
  ChartTooltip,
  ChartValueAxis,
  ChartValueAxisItem,
} from '@progress/kendo-react-charts';
import { Button, ButtonGroup } from '@progress/kendo-react-buttons';
import { DropDownList } from '@progress/kendo-react-dropdowns';
import { c3Action } from '@/c3Action';
import { BlockerStatus, MonthlyWaits, StatusHours } from '@/Interfaces';
import { STATUS_COLORS, STATUS_LABELS, WAITING_STATUSES } from './blockerStatus';

const ALL_CUSTOMERS = 'All customers';
const WAITS_COLOR = '#cbd5e1';

interface BlockerChartProps {
  hours: StatusHours[];
  /** Changes whenever blockers change, so the trend is fetched again. */
  version: number;
  onError: (message: string) => void;
}

const barLabels = {
  visible: true,
  position: 'center' as const,
  color: '#fff',
  background: 'transparent',
  content: (point: { value: number }) => (point.value ? `${point.value} d` : ''),
};

function monthLabel(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1)).toLocaleString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

/** One Kendo chart with two views: total days lost per customer, and the monthly trend. */
export default function BlockerChart({ hours, version, onError }: BlockerChartProps) {
  const [view, setView] = useState<'customers' | 'trend'>('customers');
  const [customer, setCustomer] = useState(ALL_CUSTOMERS);
  const [trend, setTrend] = useState<MonthlyWaits[]>([]);

  useEffect(() => {
    c3Action('BlockerStatusChange', 'monthlyWaits', [customer === ALL_CUSTOMERS ? null : customer])
      .then((rows: MonthlyWaits[] | '') => setTrend(rows || []))
      .catch((err) => onError(err instanceof Error ? err.message : String(err)));
  }, [customer, version, onError]);

  const byCustomer = useMemo(() => {
    const daysOf = (name: string, status: BlockerStatus) => {
      const match = hours.find((row) => row.customer === name && row.status === status);
      return match ? Math.round(match.hours / 24) : 0;
    };
    const total = (name: string) => WAITING_STATUSES.reduce((sum, status) => sum + daysOf(name, status), 0);
    const names = Array.from(new Set(hours.map((row) => row.customer))).sort((a, b) => total(b) - total(a));
    return {
      customers: names,
      series: WAITING_STATUSES.map((status) => ({ status, data: names.map((name) => daysOf(name, status)) })),
    };
  }, [hours]);

  const byMonth = useMemo(() => {
    const indexOf = (row: MonthlyWaits) => Math.round(row.year) * 12 + Math.round(row.month) - 1;
    if (!trend.length) return { months: [] as string[], waits: [] as number[], averages: [] };
    const indexes = trend.map(indexOf);
    const first = Math.min(...indexes);
    const span = Array.from({ length: Math.max(...indexes) - first + 1 }, (_, i) => first + i);
    const rowsIn = (index: number) => trend.filter((row) => indexOf(row) === index);
    return {
      months: span.map(monthLabel),
      waits: span.map((index) => rowsIn(index).reduce((sum, row) => sum + row.waits, 0)),
      averages: WAITING_STATUSES.map((status) => ({
        status,
        data: span.map((index) => {
          const row = rowsIn(index).find((r) => r.status === status);
          return row ? Math.round((row.hours / 24 / row.waits) * 10) / 10 : null;
        }),
      })),
    };
  }, [trend]);

  const customerOptions = [ALL_CUSTOMERS, ...Array.from(new Set(hours.map((row) => row.customer))).sort()];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {view === 'customers' ? 'Days lost waiting, per customer' : 'Are waits getting longer as engagements grow?'}
          </h2>
          <p className="text-sm text-secondary">
            {view === 'customers'
              ? 'All blockers, including resolved ones, split by who we were waiting on.'
              : 'Bars: waits started each month, a measure of how busy the engagement was. Lines: average days per wait. Each wait counts in the month it started; the current month is to date.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view === 'trend' && (
            <DropDownList
              data={customerOptions}
              value={customer}
              onChange={(event) => setCustomer(event.value)}
              style={{ width: 200 }}
            />
          )}
          <ButtonGroup>
            <Button togglable selected={view === 'customers'} onClick={() => setView('customers')}>
              By customer
            </Button>
            <Button togglable selected={view === 'trend'} onClick={() => setView('trend')}>
              Trend over time
            </Button>
          </ButtonGroup>
        </div>
      </div>

      <Chart key={view} style={{ height: view === 'customers' ? 80 + byCustomer.customers.length * 60 : 380 }}>
        <ChartLegend position="top" />
        {view === 'customers' ? (
          <>
            <ChartTooltip format="{0} days" />
            <ChartCategoryAxis>
              <ChartCategoryAxisItem categories={byCustomer.customers} />
            </ChartCategoryAxis>
            <ChartValueAxis>
              <ChartValueAxisItem title={{ text: 'Days' }} />
            </ChartValueAxis>
            <ChartSeries>
              {byCustomer.series.map(({ status, data }) => (
                <ChartSeriesItem
                  key={status}
                  type="bar"
                  stack
                  name={STATUS_LABELS[status]}
                  color={STATUS_COLORS[status]}
                  data={data}
                  labels={barLabels}
                />
              ))}
            </ChartSeries>
          </>
        ) : (
          <>
            <ChartTooltip shared />
            <ChartCategoryAxis>
              <ChartCategoryAxisItem categories={byMonth.months} axisCrossingValue={[0, byMonth.months.length]} />
            </ChartCategoryAxis>
            <ChartValueAxis>
              <ChartValueAxisItem name="days" title={{ text: 'Average days per wait' }} min={0} />
              <ChartValueAxisItem name="waits" title={{ text: 'Waits started' }} min={0} />
            </ChartValueAxis>
            <ChartSeries>
              <ChartSeriesItem type="column" axis="waits" name="Waits started" color={WAITS_COLOR} data={byMonth.waits} />
              {byMonth.averages.map(({ status, data }) => (
                <ChartSeriesItem
                  key={status}
                  type="line"
                  axis="days"
                  name={`Avg days ${STATUS_LABELS[status].replace("Waiting", "waiting")}`}
                  color={STATUS_COLORS[status]}
                  data={data}
                  width={3}
                  markers={{ visible: true, size: 7 }}
                />
              ))}
            </ChartSeries>
          </>
        )}
      </Chart>
    </section>
  );
}
