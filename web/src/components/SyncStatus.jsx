import { useState } from "react";
import { RefreshCw } from "lucide-react";

/** "Synced across your devices · 10:42" with a button to refresh now. */
export default function SyncStatus({ syncedAt, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  };
  const time = syncedAt ? syncedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <span className="sync-status">
      Synced across your devices{time ? ` · ${time}` : ""}
      <button type="button" className="sync-refresh" onClick={refresh} disabled={busy} title="Refresh now" aria-label="Refresh now">
        <RefreshCw size={13} className={busy ? "spin" : undefined} />
      </button>
    </span>
  );
}
