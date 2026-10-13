import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Grid,
  GridColumn,
  type GridCustomCellProps,
  type GridDetailRowProps,
  type GridDetailExpandChangeEvent,
} from '@progress/kendo-react-grid';
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
import { DropDownList, type DropDownListChangeEvent } from '@progress/kendo-react-dropdowns';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';
import { Switch, TextArea } from '@progress/kendo-react-inputs';
import { c3Action, c3MemberAction } from '@/c3Action';
import { BlockerStatus, BlockerStatusChange, StatusHours, User } from '@/Interfaces';
import NewBlockerDialog from './NewBlockerDialog';
import { STATUS_COLORS, STATUS_LABELS, STATUSES, WAITING_STATUSES } from './blockerStatus';

const MS_PER_DAY = 86400000;

interface BlockerRow {
  id: string;
  name: string;
  customer: string;
  owner: string;
  status: BlockerStatus;
  since: Date;
  daysInStatus: number;
  note?: string;
}

interface PendingChange {
  row: BlockerRow;
  status: BlockerStatus;
}

function toRow(change: BlockerStatusChange): BlockerRow {
  const since = new Date(change.changedAt);
  return {
    id: change.blocker.id,
    name: change.blocker.name,
    customer: change.blocker.customer,
    owner: change.blocker.owner,
    status: change.status,
    since,
    daysInStatus: Math.floor((Date.now() - since.getTime()) / MS_PER_DAY),
    note: change.note,
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function StatusBadge({ status }: { status: BlockerStatus }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function StatusBadgeCell(props: GridCustomCellProps) {
  return (
    <td {...props.tdProps}>
      <StatusBadge status={(props.dataItem as BlockerRow).status} />
    </td>
  );
}

function HistoryDetail({ dataItem }: GridDetailRowProps) {
  const [history, setHistory] = useState<BlockerStatusChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    c3Action('BlockerStatusChange', 'fetch', {
      filter: `blocker == '${dataItem.id}'`,
      include: 'status, changedAt, endedAt, note',
      order: 'ascending(changedAt)',
    })
      .then((result: { objs?: BlockerStatusChange[] }) => setHistory(result.objs ?? []))
      .catch((err) => setError(errorText(err)));
  }, [dataItem.id]);

  if (error) return <p className="text-sm text-danger">History unavailable: {error}</p>;
  if (!history) return <p className="text-sm text-secondary">Loading history…</p>;

  return (
    <ol className="flex flex-col gap-2 py-1">
      {history.map((change) => {
        const end = change.endedAt ? new Date(change.endedAt) : new Date();
        const days = (end.getTime() - new Date(change.changedAt).getTime()) / MS_PER_DAY;
        return (
          <li key={change.id} className="grid grid-cols-[12rem_7rem_8rem_1fr] gap-3 text-sm">
            <StatusBadge status={change.status} />
            <span className="text-secondary">{new Date(change.changedAt).toLocaleDateString()}</span>
            <span className="text-secondary">
              {change.status === 'Resolved' ? '' : `${days.toFixed(1)} days${change.endedAt ? '' : ' so far'}`}
            </span>
            <span>{change.note}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-weak bg-primary p-4">
      <span className="text-sm text-secondary">{label}</span>
      <span className="text-3xl font-semibold">{value}</span>
      <span className="text-sm text-secondary">{detail ?? ' '}</span>
    </div>
  );
}

export default function BlockersPage() {
  const [rows, setRows] = useState<BlockerRow[]>([]);
  const [hours, setHours] = useState<StatusHours[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const load = useCallback(() => {
    Promise.all([
      c3Action('BlockerStatusChange', 'fetch', {
        filter: '!exists(endedAt)',
        include: 'status, changedAt, note, blocker.name, blocker.customer, blocker.owner',
      }),
      c3Action('BlockerStatusChange', 'hoursByCustomerAndStatus', []),
    ])
      .then(([current, totals]: [{ objs?: BlockerStatusChange[] }, StatusHours[] | '']) => {
        setRows((current.objs ?? []).map(toRow));
        setHours(totals || []);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    c3Action('User', 'myUser', [])
      .then(setUser)
      .catch((err) => setError(errorText(err)));
  }, []);

  const closeDialog = () => {
    setPending(null);
    setNote('');
  };

  const refresh = () => {
    setExpanded({});
    load();
  };

  const saveChange = () => {
    if (!pending) return;
    setSaving(true);
    c3MemberAction('Blocker', 'changeStatus', { id: pending.row.id }, [pending.status, note || null])
      .then(() => {
        closeDialog();
        refresh();
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setSaving(false));
  };

  const ChangeStatusCell = (props: GridCustomCellProps) => {
    const row = props.dataItem as BlockerRow;
    const options = STATUSES.filter((status) => status !== row.status).map((status) => ({
      status,
      label: STATUS_LABELS[status],
    }));
    return (
      <td {...props.tdProps}>
        <DropDownList
          data={options}
          textField="label"
          dataItemKey="status"
          value={null}
          defaultItem={{ status: row.status, label: 'Update…' }}
          onChange={(event: DropDownListChangeEvent) => {
            if (event.value.status !== row.status) setPending({ row, status: event.value.status });
          }}
          size="small"
        />
      </td>
    );
  };

  const active = rows.filter((row) => row.status !== 'Resolved');
  const waitingSummary = (status: BlockerStatus) => {
    const waiting = active.filter((row) => row.status === status);
    const longest = waiting.reduce<BlockerRow | null>(
      (max, row) => (!max || row.daysInStatus > max.daysInStatus ? row : max),
      null
    );
    return {
      count: waiting.length,
      detail: longest ? `Longest: ${longest.daysInStatus} days (${longest.customer})` : undefined,
    };
  };
  const onCustomer = waitingSummary('WaitingOnCustomer');
  const onC3 = waitingSummary('WaitingOnC3');

  // Memoized so expanding a row or opening a dialog does not redraw the chart.
  const { customers, series } = useMemo(() => {
    const daysOf = (customer: string, status: BlockerStatus) => {
      const match = hours.find((row) => row.customer === customer && row.status === status);
      return match ? Math.round(match.hours / 24) : 0;
    };
    const total = (customer: string) => WAITING_STATUSES.reduce((sum, status) => sum + daysOf(customer, status), 0);
    const names = Array.from(new Set(hours.map((row) => row.customer))).sort((a, b) => total(b) - total(a));
    return {
      customers: names,
      series: WAITING_STATUSES.map((status) => ({ status, data: names.map((name) => daysOf(name, status)) })),
    };
  }, [hours]);

  const knownCustomers = Array.from(new Set(rows.map((row) => row.customer))).sort();
  const knownOwners = Array.from(new Set(rows.map((row) => row.owner))).sort();

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Customer blockers</h1>
          <p className="text-sm text-secondary">What is holding up each engagement, and whose court the ball is in.</p>
        </div>
        {user && <span className="text-sm text-secondary">Signed in as {user.name}</span>}
      </header>

      {error && <p className="text-sm text-danger">Something went wrong: {error}</p>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryTile label="Active blockers" value={active.length} />
        <SummaryTile label="Waiting on customers" value={onCustomer.count} detail={onCustomer.detail} />
        <SummaryTile label="Waiting on C3" value={onC3.count} detail={onC3.detail} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Blockers, longest wait first</h2>
          <div className="flex items-center gap-2 text-sm">
            <Button themeColor="primary" onClick={() => setCreating(true)}>
              New blocker
            </Button>
            <Switch
              id="show-resolved"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.value)}
              size="small"
            />
            <label htmlFor="show-resolved" className="ml-2">
              Show resolved
            </label>
          </div>
        </div>
        <Grid
          data={showResolved ? rows : active}
          dataItemKey="id"
          autoProcessData
          sortable
          defaultSort={[{ field: 'daysInStatus', dir: 'desc' }]}
          detail={HistoryDetail}
          detailExpand={expanded}
          onDetailExpandChange={(event: GridDetailExpandChangeEvent) => setExpanded(event.detailExpand)}
        >
          <GridColumn field="name" title="Blocker" />
          <GridColumn field="customer" title="Customer" width="170px" />
          <GridColumn field="owner" title="Owner" width="140px" />
          <GridColumn field="status" title="Waiting on" width="200px" cells={{ data: StatusBadgeCell }} />
          <GridColumn field="daysInStatus" title="Days" width="90px" />
          <GridColumn field="since" title="Since" format="{0:d}" width="110px" />
          <GridColumn title="" width="150px" sortable={false} cells={{ data: ChangeStatusCell }} />
        </Grid>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Days lost waiting, per customer</h2>
        <p className="text-sm text-secondary">All blockers, including resolved ones, split by who we were waiting on.</p>
        <Chart style={{ height: 80 + customers.length * 70 }}>
          <ChartLegend position="top" />
          <ChartTooltip format="{0} days" />
          <ChartCategoryAxis>
            <ChartCategoryAxisItem categories={customers} />
          </ChartCategoryAxis>
          <ChartValueAxis>
            <ChartValueAxisItem title={{ text: 'Days' }} />
          </ChartValueAxis>
          <ChartSeries>
            {series.map(({ status, data }) => (
              <ChartSeriesItem
                key={status}
                type="bar"
                stack
                name={STATUS_LABELS[status]}
                color={STATUS_COLORS[status]}
                data={data}
                labels={{
                  visible: true,
                  position: 'center',
                  color: '#fff',
                  background: 'transparent',
                  content: (point) => (point.value ? `${point.value} d` : ''),
                }}
              />
            ))}
          </ChartSeries>
        </Chart>
      </section>

      {creating && (
        <NewBlockerDialog
          customers={knownCustomers}
          owners={knownOwners}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {pending && (
        <Dialog title={`Mark as "${STATUS_LABELS[pending.status]}"`} onClose={closeDialog} width={460}>
          <p className="mb-2 text-sm">{pending.row.name}</p>
          <TextArea
            value={note}
            onChange={(event) => setNote(String(event.value ?? ''))}
            placeholder="What changed? (optional)"
            rows={3}
          />
          <DialogActionsBar>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button themeColor="primary" disabled={saving} onClick={saveChange}>
              Save
            </Button>
          </DialogActionsBar>
        </Dialog>
      )}
    </div>
  );
}
