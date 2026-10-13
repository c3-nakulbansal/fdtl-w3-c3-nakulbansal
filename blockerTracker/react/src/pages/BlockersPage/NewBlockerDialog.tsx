import { useState } from 'react';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';
import { ComboBox, DropDownList } from '@progress/kendo-react-dropdowns';
import { Input, TextArea } from '@progress/kendo-react-inputs';
import { Label } from '@progress/kendo-react-labels';
import { c3CreateAction, c3MemberAction } from '@/c3Action';
import { STATUS_LABELS, WAITING_STATUSES } from './blockerStatus';

interface NewBlockerDialogProps {
  customers: string[];
  owners: string[];
  onClose: () => void;
  onCreated: () => void;
}

const WAITING_OPTIONS = WAITING_STATUSES.map((status) => ({ status, label: STATUS_LABELS[status] }));

/** Creates the Blocker with the platform's create, then opens its first status period. */
export default function NewBlockerDialog({ customers, owners, onClose, onCreated }: NewBlockerDialogProps) {
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [owner, setOwner] = useState('');
  const [waitingOn, setWaitingOn] = useState(WAITING_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim() && customer.trim() && owner.trim();

  const save = () => {
    setSaving(true);
    c3CreateAction('Blocker', 'create', { name: name.trim(), customer: customer.trim(), owner: owner.trim() })
      .then((blocker: { id: string }) =>
        c3MemberAction('Blocker', 'changeStatus', { id: blocker.id }, [waitingOn.status, note || null])
      )
      .then(onCreated)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog title="New blocker" onClose={onClose} width={520}>
      <div className="flex flex-col gap-3">
        <Label>
          What is blocked
          <Input value={name} onChange={(event) => setName(String(event.value ?? ''))} placeholder="e.g. VPN access" />
        </Label>
        <Label>
          Customer
          <ComboBox
            data={customers}
            value={customer || null}
            allowCustom
            placeholder="Pick one or type a new customer"
            onChange={(event) => setCustomer(String(event.value ?? ''))}
          />
        </Label>
        <Label>
          Owner
          <ComboBox
            data={owners}
            value={owner || null}
            allowCustom
            placeholder="Who on our side owns it"
            onChange={(event) => setOwner(String(event.value ?? ''))}
          />
        </Label>
        <Label>
          Waiting on
          <DropDownList
            data={WAITING_OPTIONS}
            textField="label"
            dataItemKey="status"
            value={waitingOn}
            onChange={(event) => setWaitingOn(event.value)}
          />
        </Label>
        <Label>
          Note
          <TextArea
            value={note}
            onChange={(event) => setNote(String(event.value ?? ''))}
            placeholder="What is it waiting for? (optional)"
            rows={3}
          />
        </Label>
        {error && <p className="text-sm text-danger">Could not create the blocker: {error}</p>}
      </div>
      <DialogActionsBar>
        <Button onClick={onClose}>Cancel</Button>
        <Button themeColor="primary" disabled={!ready || saving} onClick={save}>
          Create
        </Button>
      </DialogActionsBar>
    </Dialog>
  );
}
