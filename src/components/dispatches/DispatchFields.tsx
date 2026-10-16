import React from "react";
import { useDispatches } from "@/lib/dispatches";

// Story editor: which dispatch a chapter belongs to, and its chapter number.

export const DispatchFields: React.FC<{
  dispatchId: string | null;
  part: number | null;
  onChange: (next: { dispatchId: string | null; part: number | null }) => void;
}> = ({ dispatchId, part, onChange }) => {
  const dispatches = useDispatches();
  const field = "px-3 py-2 bg-background border border-border text-sm focus:outline-none focus:border-primary";

  if (dispatches && dispatches.length === 0) {
    return <p className="text-xs text-destructive mt-3">Create a dispatch first in Admin → Dispatches.</p>;
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mt-3">
      <label className="block">
        <span className="block text-xs text-muted-foreground mb-1">Dispatch</span>
        <select value={dispatchId || ""} onChange={(e) => onChange({ dispatchId: e.target.value || null, part })} className={`${field} min-w-[14rem]`}>
          <option value="">Choose…</option>
          {(dispatches || []).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs text-muted-foreground mb-1">Chapter number</span>
        <input type="number" min={1} value={part ?? ""} onChange={(e) => onChange({ dispatchId, part: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })} className={`${field} w-28`} />
      </label>
    </div>
  );
};

export default DispatchFields;
