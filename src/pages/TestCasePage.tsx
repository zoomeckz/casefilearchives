import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { InteractiveReader } from "@/components/interactive/InteractiveReader";
import { normalizeGraph, type InteractiveGraph } from "@/lib/interactive";

/**
 * Tester link for an Interactive Case File: /test-case/<id>.
 * Loads a snapshot the archivist made from the editor ("Copy test link").
 * No account needed; progress stays on the tester's device and nothing is saved to the archive.
 */
const TestCasePage = () => {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ title: string; graph: InteractiveGraph; createdAt?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) { setError("This test link is not valid."); return; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/images/test-cases/${id}.json`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => setData({ title: String(j?.title || "Untitled case"), graph: normalizeGraph(j?.graph), createdAt: j?.createdAt }))
      .catch(() => setError("This test link has expired or does not exist."));
  }, [id]);

  useEffect(() => {
    document.title = data ? `Test: ${data.title}` : "Case file test";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, [data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8 sm:py-12" style={{ fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.9, fontSize: "1.05rem" }}>
        {error && <p className="text-center text-muted-foreground py-24">{error}</p>}
        {!error && !data && <p className="text-center text-muted-foreground py-24">Loading case file…</p>}
        {data && (
          <>
            <header className="text-center mb-10">
              <span className="case-label text-[10px] text-primary">Test copy · not published</span>
              <h1 className="font-display text-3xl sm:text-4xl text-primary mt-2" style={{ lineHeight: 1.2 }}>{data.title}</h1>
              {data.createdAt && (
                <p className="text-xs text-muted-foreground mt-2">Version from {new Date(data.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
              )}
            </header>
            <InteractiveReader chapterId={`test-${id}`} title={data.title} graph={data.graph} user={null} mode="preview" testKey={`ic-test:${id}`} />
          </>
        )}
      </div>
    </div>
  );
};

export default TestCasePage;
