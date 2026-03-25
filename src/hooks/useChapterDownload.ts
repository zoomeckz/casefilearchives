const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  // Fetch all chapters in a single request with explicit high limit
  const response = await fetch(
    `${url}/rest/v1/chapters?select=title,content,chapter_number&order=chapter_number.asc&limit=1000`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch chapters");
  }

  const allChapters = await response.json();
  if (!Array.isArray(allChapters) || allChapters.length === 0) {
    throw new Error("No chapters found");
  }

  console.log(`[Download] Fetched ${allChapters.length} chapters`);

  if (allChapters.length === 0) {
    throw new Error("No chapters found");
  }

  const separator = "═".repeat(60);
  const lines: string[] = [
    "SEDORIUM",
    "A Dark Fantasy Series by Sam Nowroozi Larki",
    separator,
    `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Total Chapters: ${allChapters.length}`,
    separator,
    "",
    "",
  ];

  for (const ch of allChapters) {
    lines.push(separator);
    lines.push(`CHAPTER ${ch.chapter_number}: ${(ch.title || "").toUpperCase()}`);
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
  a.download = `Sedorium_All_Chapters.txt`;
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
