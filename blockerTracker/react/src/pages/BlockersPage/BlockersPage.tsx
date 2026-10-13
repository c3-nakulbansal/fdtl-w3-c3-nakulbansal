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
  ChartTitle,
  ChartTooltip,
  ChartValueAxis,
  ChartValueAxisItem,
} from '@progress/kendo-react-charts';
import { DropDownList, type DropDownListChangeEvent } from '@progress/kendo-react-dropdowns';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';
import { TextArea } from '@progress/kendo-react-inputs';
import { c3Action, c3MemberAction } from '@/c3Action';
import { BlockerStatus, BlockerStatusChange, StatusHours } from '@/Interfaces';

const STATUS_LABELS: Record<BlockerStatus, string> = {
  Open: 'Open',
  WaitingOnCustomer: 'Waiting on customer',
  WaitingOnC3: 'Waiting on C3',
  Resolved: 'Resolved',
};
const STATUSES = Object.keys(STATUS_LABELS) as BlockerStatus[];
const UNRESOLVED_STATUSES = STATUSES.filter((status) => status !== 'Resolved');
const MS_PER_DAY = 86400000;

interface BlockerRow {
  id: string;
  name: string;
  customer: string;
  owner: string;
  status: BlockerStatus;
  statusLabel: string;
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
    statusLabel: STATUS_LABELS[change.status],
    since,
    daysInStatus: Math.floor((Date.now() - since.getTime()) / MS_PER_DAY),
    note: change.note,
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
          <li key={change.id} className="grid grid-cols-[11rem_9rem_7rem_1fr] gap-3 text-sm">
            <span className="font-medium">{STATUS_LABELS[change.status]}</span>
            <span className="text-secondary">{new Date(change.changedAt).toLocaleDateString()}</span>
            <span className="text-secondary">
              {change.endedAt ? `${days.toFixed(1)} days` : `${days.toFixed(1)} days so far`}
            </span>
            <span>{change.note}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function BlockersPage() {
  const [rows, setRows] = useState<BlockerRow[]>([]);
  const [hours, setHours] = useState<StatusHours[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

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

  const saveChange = () => {
    if (!pending) return;
    setSaving(true);
    c3MemberAction('Blocker', 'changeStatus', { id: pending.row.id }, [pending.status, note || null])
      .then(() => {
        setPending(null);
        setNote('');
        setExpanded({});
        load();
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setSaving(false));
  };

  const StatusCell = (props: GridCustomCellProps) => {
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
          defaultItem={{ status: row.status, label: 'Change status…' }}
          onChange={(event: DropDownListChangeEvent) => setPending({ row, status: event.value.status })}
          size="small"
        />
      </td>
    );
  };

  // Memoized so expanding a row or opening the dialog does not redraw the chart.
  const { customers, series } = useMemo(() => {
    const names = Array.from(new Set(hours.map((row) => row.customer))).sort();
    const daysFor = (status: BlockerStatus) =>
      names.map((customer) => {
        const match = hours.find((row) => row.customer === customer && row.status === status);
        return match ? Math.round((match.hours / 24) * 10) / 10 : 0;
      });
    return {
      customers: names,
      series: UNRESOLVED_STATUSES.map((status) => ({ status, data: daysFor(status) })),
    };
  }, [hours]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Customer blockers</h1>
        <p className="text-sm text-secondary">
          What is holding up each engagement, who it is waiting on, and for how long. Expand a row for its full history.
        </p>
      </header>

      {error && <p className="text-sm text-danger">Could not load blockers: {error}</p>}

      <Grid
        data={rows}
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
        <GridColumn field="statusLabel" title="Status" width="180px" />
        <GridColumn field="daysInStatus" title="Days in status" width="130px" />
        <GridColumn field="since" title="Since" format="{0:d}" width="120px" />
        <GridColumn title="" width="190px" sortable={false} cells={{ data: StatusCell }} />
      </Grid>

      <Chart style={{ height: 360 }}>
        <ChartTitle text="Days blocked per customer, by who it was waiting on" />
        <ChartLegend position="bottom" />
        <ChartTooltip format="{0} days" />
        <ChartCategoryAxis>
          <ChartCategoryAxisItem categories={customers} />
        </ChartCategoryAxis>
        <ChartValueAxis>
          <ChartValueAxisItem title={{ text: 'Days' }} />
        </ChartValueAxis>
        <ChartSeries>
          {series.map(({ status, data }) => (
            <ChartSeriesItem key={status} type="bar" stack name={STATUS_LABELS[status]} data={data} />
          ))}
        </ChartSeries>
      </Chart>

      {pending && (
        <Dialog title={`Move to "${STATUS_LABELS[pending.status]}"`} onClose={() => setPending(null)} width={460}>
          <p className="mb-2 text-sm">{pending.row.name}</p>
          <TextArea
            value={note}
            onChange={(event) => setNote(String(event.value ?? ''))}
            placeholder="What changed? (optional)"
            rows={3}
          />
          <DialogActionsBar>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button themeColor="primary" disabled={saving} onClick={saveChange}>
              Save
            </Button>
          </DialogActionsBar>
        </Dialog>
      )}
    </div>
  );
}
