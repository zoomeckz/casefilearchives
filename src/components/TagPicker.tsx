import React, { useEffect, useState, useCallback } from 'react';
import { Star, X, Plus } from 'lucide-react';
import { dbFetch } from '@/lib/dbFetch';
import { toast } from 'sonner';

interface StoryTag { id: string; name: string; is_favorite: boolean }

interface TagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
  authToken?: string;
  /** Hide the built-in "Tags" heading (when the surrounding box already shows one). */
  hideLabel?: boolean;
}

export const TagPicker: React.FC<TagPickerProps> = ({ selected, onChange, authToken, hideLabel }) => {
  const [tags, setTags] = useState<StoryTag[]>([]);
  const [newTag, setNewTag] = useState('');
  const [manage, setManage] = useState(false);

  const load = useCallback(async () => {
    const { data } = await dbFetch<StoryTag[]>('story_tags', { select: 'id,name,is_favorite', order: 'name.asc', token: authToken });
    if (data) setTags(data);
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...tags].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name));

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);

  const add = async () => {
    const name = newTag.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      if (!selected.includes(name)) toggle(tags.find((t) => t.name.toLowerCase() === name.toLowerCase())!.name);
      setNewTag('');
      return;
    }
    const { error } = await dbFetch('story_tags', { method: 'POST', body: { name }, token: authToken });
    if (error) return toast.error(error);
    setNewTag('');
    onChange([...selected, name]);
    load();
  };

  const favorite = async (t: StoryTag) => {
    setTags((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_favorite: !x.is_favorite } : x)));
    const { error } = await dbFetch('story_tags', { method: 'PATCH', filters: `id=eq.${t.id}`, body: { is_favorite: !t.is_favorite }, token: authToken });
    if (error) { toast.error(error); load(); }
  };

  const remove = async (t: StoryTag) => {
    if (!confirm(`Remove the tag "${t.name}" from your tag list? Stories already using it keep it.`)) return;
    const { error } = await dbFetch('story_tags', { method: 'DELETE', filters: `id=eq.${t.id}`, token: authToken });
    if (error) return toast.error(error);
    load();
  };

  return (
    <div>
      <div className={`flex items-center mb-2 ${hideLabel ? 'justify-end' : 'justify-between'}`}>
        {!hideLabel && <label className="text-sm text-muted-foreground">Tags</label>}
        <button type="button" onClick={() => setManage((m) => !m)} className="text-xs text-muted-foreground hover:text-foreground">
          {manage ? 'Done' : 'Manage tags'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sorted.map((t) => {
          const on = selected.includes(t.name);
          return (
            <span
              key={t.id}
              className={`inline-flex items-center gap-1 rounded-full border text-xs transition-colors ${
                on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <button type="button" onClick={() => favorite(t)} className="pl-2 py-1" title={t.is_favorite ? 'Unfavorite' : 'Favorite'}>
                <Star className={`w-3 h-3 ${t.is_favorite ? 'fill-current text-accent' : 'opacity-40'}`} />
              </button>
              <button type="button" onClick={() => toggle(t.name)} className={`py-1 ${manage ? '' : 'pr-3'}`}>{t.name}</button>
              {manage && (
                <button type="button" onClick={() => remove(t)} className="pr-2 py-1 hover:text-destructive" title="Remove tag">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
        {selected.filter((s) => !tags.some((t) => t.name === s)).map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)} className="px-3 py-1 rounded-full border text-xs bg-primary text-primary-foreground border-primary">
            {s} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3 max-w-xs">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add a new tag..."
          className="flex-1 px-3 py-1.5 bg-card/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
        />
        <button type="button" onClick={add} className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm text-foreground">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
