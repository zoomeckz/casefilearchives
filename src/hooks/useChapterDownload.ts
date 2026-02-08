import { supabase } from "@/integrations/supabase/client";

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  
  // Convert <p> tags to double newlines
  div.querySelectorAll("p").forEach((p) => {
    p.insertAdjacentText("afterend", "\n\n");
  });
  // Convert <br> to newlines
  div.querySelectorAll("br").forEach((br) => {
    br.replaceWith("\n");
  });
  
  return (div.textContent || div.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

export async function downloadAllChapters() {
  const { data: chapters, error } = await supabase
    .from("chapters")
    .select("title, content, chapter_number")
    .order("chapter_number", { ascending: true });

  if (error || !chapters) {
    throw new Error("Failed to fetch chapters");
  }

  const separator = "═".repeat(60);
  const lines: string[] = [
    "SEDORIUM",
    "A Dark Fantasy Series by Sam Nowroozi Larki",
    separator,
    `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Total Chapters: ${chapters.length}`,
    separator,
    "",
    "",
  ];

  for (const ch of chapters) {
    lines.push(separator);
    lines.push(`CHAPTER ${ch.chapter_number}: ${ch.title.toUpperCase()}`);
    lines.push(separator);
    lines.push("");
    lines.push(stripHtml(ch.content));
    lines.push("");
    lines.push("");
  }

  lines.push(separator);
  lines.push("END OF DOCUMENT");
  lines.push(separator);

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Sedorium_All_Chapters.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
