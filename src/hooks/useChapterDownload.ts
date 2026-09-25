const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Reads the current admin session token (if any) so RLS lets us fetch
// scheduled/future chapters in addition to live ones.
function getAuthToken(): string {
  try {
    const raw = localStorage.getItem('app-auth-session');
    if (!raw) return key;
    const session = JSON.parse(raw);
    return session?.access_token || key;
  } catch {
    return key;
  }
}

export async function downloadSingleChapter(chapterNumber: number, title: string, legacy = false) {
  const token = getAuthToken();
  const response = await fetch(
    `${url}/rest/v1/chapters?select=title,content,chapter_number,published_at&chapter_number=eq.${chapterNumber}`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error(`Failed to fetch ${legacy ? 'chapter' : 'story'}`);
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`${legacy ? 'Chapter' : 'Story'} not found`);

  const ch = data[0];
  const separator = "═".repeat(60);
  const lines = [
    "CASE FILES",
    separator,
    legacy ? `CHAPTER ${ch.chapter_number}: ${(ch.title || "").toUpperCase()}` : (ch.title || "UNTITLED STORY").toUpperCase(),
    !legacy && ch.published_at ? new Date(ch.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "",
    separator,
    "",
    stripHtml(ch.content || ""),
    "",
    separator,
  ];

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  const safeTitle = (title || "Untitled_Story").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  a.download = legacy ? `Legacy_Chapter_${ch.chapter_number}.txt` : `Case_File_${safeTitle}.txt`;
  a.style.display = "none";
  document.body.appendChild(a);
  await new Promise((r) => setTimeout(r, 100));
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 5000);
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  // Convert block elements to line breaks before extracting text
  const blockTags = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "tr"];
  blockTags.forEach((tag) => {
    div.querySelectorAll(tag).forEach((el) => {
      el.insertAdjacentText("beforebegin", "\n");
      el.insertAdjacentText("afterend", "\n");
    });
  });

  div.querySelectorAll("br").forEach((br) => {
    br.replaceWith("\n");
  });

  // Handle horizontal rules
  div.querySelectorAll("hr").forEach((hr) => {
    hr.replaceWith("\n---\n");
  });

  const text = (div.textContent || div.innerText || "")
    .replace(/[ \t]+/g, " ")        // collapse spaces/tabs
    .replace(/\n /g, "\n")          // trim leading space after newline
    .replace(/ \n/g, "\n")          // trim trailing space before newline
    .replace(/\n{3,}/g, "\n\n")    // max 2 consecutive newlines
    .trim();

  return text;
}

export async function downloadAllChapters() {
  // Use the admin's access token so scheduled stories are included.
  const token = getAuthToken();

  // Fetch all current stories in a single request with an explicit high limit.
  const response = await fetch(
    `${url}/rest/v1/chapters?select=title,content,published_at&is_archived=eq.false&order=published_at.desc&limit=1000`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch stories");
  }

  const allChapters = await response.json();
  if (!Array.isArray(allChapters) || allChapters.length === 0) {
    throw new Error("No stories found");
  }

  console.log(`[Download] Fetched ${allChapters.length} stories`);

  if (allChapters.length === 0) {
    throw new Error("No stories found");
  }

  const separator = "═".repeat(60);
  const lines: string[] = [
    "CASE FILES",
    "Standalone stories by AnyoneButSam",
    separator,
    `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Total Stories: ${allChapters.length}`,
    separator,
    "",
    "",
  ];

  for (const ch of allChapters) {
    lines.push(separator);
    lines.push((ch.title || "UNTITLED STORY").toUpperCase());
    if (ch.published_at) lines.push(new Date(ch.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    lines.push(separator);
    lines.push("");
    lines.push(stripHtml(ch.content || ""));
    lines.push("");
    lines.push("");
  }

  lines.push(separator);
  lines.push("END OF DOCUMENT");
  lines.push(separator);

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  // Use window.open as fallback for mobile browsers where <a> click doesn't trigger download
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `Case_File_All_Stories.txt`;
  a.style.display = "none";
  document.body.appendChild(a);

  // Some mobile browsers need a small delay
  await new Promise((r) => setTimeout(r, 100));
  a.click();

  // Cleanup after a longer delay to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 5000);
}
