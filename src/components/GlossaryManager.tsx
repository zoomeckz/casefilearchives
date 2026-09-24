import React, { useState } from 'react';
import { Icons } from '@/lib/icons';
import { dbFetch } from '@/lib/dbFetch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface GlossaryItem {
  id: string;
  term: string;
  description: string;
  type: string;
  image_url: string | null;
  aliases?: string[] | null;
}

interface GlossaryManagerProps {
  authToken?: string;
  entries: GlossaryItem[];
  onRefresh: () => void;
}

const TYPES = ['character', 'location', 'creature', 'concept'] as const;

export const GlossaryManager: React.FC<GlossaryManagerProps> = ({ authToken, entries, onRefresh }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ term: '', description: '', type: 'character', image_url: '', aliases: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<null | {
    matched: number;
    updated: number;
    cleared: number;
    unmatchedFiles: string[];
    changes: Array<{ term: string; from: string | null; to: string | null; reason: string }>;
  }>(null);

  const resetForm = () => {
    setForm({ term: '', description: '', type: 'character', image_url: '', aliases: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (entry: GlossaryItem) => {
    setForm({
      term: entry.term,
      description: entry.description,
      type: entry.type,
      image_url: entry.image_url || '',
      aliases: Array.isArray(entry.aliases) ? entry.aliases.join(', ') : '',
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.term.trim() || !form.description.trim()) {
      toast.error('Term and description are required');
      return;
    }

    setSaving(true);
    try {
      const aliases = form.aliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      const body: any = {
        term: form.term.trim(),
        description: form.description.trim(),
        type: form.type,
        image_url: form.image_url.trim() || null,
        aliases,
      };

      if (editingId) {
        const { error } = await dbFetch('glossary', {
          method: 'PATCH',
          filters: `id=eq.${editingId}`,
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success('Glossary entry updated');
      } else {
        const { error } = await dbFetch('glossary', {
          method: 'POST',
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success('Glossary entry added');
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, term: string) => {
    if (!confirm(`Delete glossary entry "${term}"?`)) return;
    const { error } = await dbFetch('glossary', {
      method: 'DELETE',
      filters: `id=eq.${id}`,
      token: authToken,
    });
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Entry deleted');
      onRefresh();
    }
  };

  const runSync = async (dryRun: boolean) => {
    setSyncing(true);
    setSyncReport(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        `sync-glossary-images${dryRun ? '?dryRun=1' : ''}`,
        { method: 'POST' },
      );
      if (error) throw error;
      const payload = data as any;
      setSyncReport({
        matched: payload.matched ?? 0,
        updated: payload.updated ?? 0,
        cleared: payload.cleared ?? 0,
        unmatchedFiles: payload.unmatchedFiles ?? [],
        changes: payload.changes ?? [],
      });
      const verb = dryRun ? 'Preview' : 'Sync complete';
      toast.success(
        `${verb}: ${payload.updated ?? 0} linked, ${payload.cleared ?? 0} cleared`,
      );
      if (!dryRun) onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl text-accent">Glossary</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runSync(true)}
            disabled={syncing}
            title="Preview which entries would be updated, without writing changes"
            className="px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Scanning…' : 'Preview Sync'}
          </button>
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            title="Scan storage and link missing/mismatched glossary images"
            className="px-4 py-2.5 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync Images'}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
          >
            <Icons.Plus className="w-4 h-4" />
            New Entry
          </button>
        </div>
      </div>

      {syncReport && (
        <div className="mb-6 p-4 bg-card/50 rounded-xl border border-border text-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base text-foreground">Sync Report</h3>
            <button
              onClick={() => setSyncReport(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <p className="text-muted-foreground mb-3">
            <span className="text-foreground font-medium">{syncReport.matched}</span> matched ·{' '}
            <span className="text-foreground font-medium">{syncReport.updated}</span> linked ·{' '}
            <span className="text-foreground font-medium">{syncReport.cleared}</span> cleared
          </p>
          {syncReport.changes.length > 0 && (
            <details className="mb-2" open>
              <summary className="cursor-pointer text-foreground mb-2">
                Changes ({syncReport.changes.length})
              </summary>
              <ul className="space-y-1 ml-4 text-xs text-muted-foreground">
                {syncReport.changes.map((c, i) => (
                  <li key={i}>
                    <span className="text-foreground">{c.term}</span> — {c.reason}
                    {c.to && (
                      <span className="text-accent"> → {c.to.split('/').pop()}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {syncReport.unmatchedFiles.length > 0 && (
            <details>
              <summary className="cursor-pointer text-foreground mb-2">
                Unmatched files in storage ({syncReport.unmatchedFiles.length})
              </summary>
              <ul className="space-y-1 ml-4 text-xs text-muted-foreground">
                {syncReport.unmatchedFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2 ml-4">
                Tip: use the legacy character name in the filename for automatic matching.
              </p>
            </details>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-8 p-6 bg-card/50 rounded-xl border border-border">
          <h3 className="font-display text-lg text-foreground mb-4">
            {editingId ? 'Edit Entry' : 'New Glossary Entry'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Term</label>
              <input
                type="text"
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
                placeholder="e.g. Beambreak"
                className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                {TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe this term..."
              rows={3}
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors resize-y"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-1">Image URL (optional)</label>
            <input
              type="text"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-1">
              Aliases (optional, comma-separated)
            </label>
            <input
              type="text"
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
              placeholder="e.g. Dorren, The Captain"
              className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Alternate names readers might search for. Each alias also gets wrapped in chapter prose and links back to this entry's spoiler-gating.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Entry'}
            </button>
            <button
              onClick={resetForm}
              className="px-5 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No glossary entries yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between p-4 bg-card/30 rounded-lg border border-border/50 group">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-foreground font-medium">{entry.term}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    entry.type === 'character' ? 'bg-primary/10 text-primary'
                    : entry.type === 'location' ? 'bg-accent/10 text-accent'
                    : entry.type === 'creature' ? 'bg-destructive/10 text-destructive'
                    : 'bg-purple-400/10 text-purple-400'
                  }`}>
                    {entry.type}
                  </span>
                  {entry.image_url && (
                    <span className="text-xs text-muted-foreground">🖼</span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{entry.description}</p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                <button
                  onClick={() => startEdit(entry)}
                  className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded text-sm transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(entry.id, entry.term)}
                  className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive rounded text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GlossaryManager;
