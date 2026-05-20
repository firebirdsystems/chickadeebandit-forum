// Shared utilities (memberColor, initial, isAdult, formatRelativeDate) live in /hub-sdk.js.
// esc is redefined here so this module is self-contained for unit tests.
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Markdown ───────────────────────────────────────────────────────────────────
// Exported for unit testing; called by renderMarkdown internally.
export function applyInline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, t, u) =>
      `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}

function renderBlock(text) {
  const lines = text.split("\n");
  const out = [];
  let inUl = false, inOl = false;

  for (const raw of lines) {
    const isUl = /^[-*] /.test(raw);
    const olMatch = !isUl && raw.match(/^(\d+)\. (.*)/);

    if (inUl && !isUl)  { out.push("</ul>"); inUl = false; }
    if (inOl && !olMatch) { out.push("</ol>"); inOl = false; }

    if (!raw.trim()) { out.push(""); continue; }

    if (/^### /.test(raw)) { out.push(`<h3>${applyInline(esc(raw.slice(4)))}</h3>`); continue; }
    if (/^## /.test(raw))  { out.push(`<h2>${applyInline(esc(raw.slice(3)))}</h2>`); continue; }
    if (/^# /.test(raw))   { out.push(`<h1>${applyInline(esc(raw.slice(2)))}</h1>`); continue; }
    if (/^> /.test(raw))   { out.push(`<blockquote>${applyInline(esc(raw.slice(2)))}</blockquote>`); continue; }

    if (isUl) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${applyInline(esc(raw.slice(2)))}</li>`);
      continue;
    }
    if (olMatch) {
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${applyInline(esc(olMatch[2]))}</li>`);
      continue;
    }

    out.push(`<p>${applyInline(esc(raw))}</p>`);
  }

  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");
  return out.join("\n");
}

export function renderMarkdown(raw) {
  if (!raw) return "";
  // Split on fenced code blocks first so their contents aren't transformed.
  const parts = raw.split(/(```[\s\S]*?```)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const inner = esc(part.slice(3, -3).replace(/^\n/, "").replace(/\n$/, ""));
      return `<pre><code>${inner}</code></pre>`;
    }
    return renderBlock(part);
  }).join("");
}

// Strip markdown to plain text for previews (no HTML entities — readable in UI).
export function stripMarkdown(raw) {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,3} /gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*] /gm, "")
    .replace(/^\d+\. /gm, "")
    .replace(/^> /gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

// ── Reactions ──────────────────────────────────────────────────────────────────
// rows: [{ target_id, emoji, author_id }]
// returns: { [targetId]: { [emoji]: { count, authorIds } } }
export function groupReactions(rows) {
  const result = {};
  for (const { target_id, emoji, author_id } of rows) {
    if (!result[target_id]) result[target_id] = {};
    if (!result[target_id][emoji]) result[target_id][emoji] = { count: 0, authorIds: [] };
    result[target_id][emoji].count++;
    result[target_id][emoji].authorIds.push(author_id);
  }
  return result;
}

export function hasReacted(reactionMap, targetId, emoji, memberId) {
  return reactionMap[targetId]?.[emoji]?.authorIds.includes(memberId) ?? false;
}

export function reactionSummary(reactionMap, targetId) {
  const byEmoji = reactionMap[targetId] ?? {};
  return Object.entries(byEmoji)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([emoji, { count }]) => ({ emoji, count }));
}

// ── Threads ────────────────────────────────────────────────────────────────────
export function sortThreads(threads) {
  return [...threads].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

