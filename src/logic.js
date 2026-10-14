// Shared utilities — sourced from shared.js (mirrors hub-sdk.js) for testability.
import { AVATAR_COLORS, memberColor, initial, esc, isAdult, formatRelativeDate } from "./shared.js";
export { AVATAR_COLORS, memberColor, initial, esc, isAdult, formatRelativeDate };

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


/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * The thread body and author both count — a discussion is looked for
 * by what was said in it and by who started it, not by a title someone
 * chose months ago. Only threads are searched: replies are not loaded
 * until a thread is opened.
 */
export function searchableFields(item) {
  return [item.title, item.body, item.author_name];
}

/**
 * Whether a member may delete a reply someone else wrote. Mirrors the hub's
 * rule for the replies table (inherit_visibility with adults_bypass): every
 * adult in a household, the steward in a shared space, and nobody in a
 * co-parenting space, where one parent never overrules the other.
 */
export function supervisesReplies(member, { tenantKind = "household", spaceKind = null, isAdmin = false } = {}) {
  if (tenantKind === "household") return isAdult(member);
  return spaceKind !== "coparenting" && isAdmin === true;
}

/** A reply's own author may always delete it; so may whoever supervises replies. */
export function canDeleteReply(reply, member, tenant) {
  return !!member && (reply.author_id === member.id || supervisesReplies(member, tenant));
}

/**
 * Whether a member may pin or delete a thread someone else started. Mirrors the
 * hub's rule for the threads table (owner_or_visibility): every adult in a
 * household, and only the steward in a shared space, co-parenting included.
 * From anyone else such a write changes nothing.
 */
export function supervisesThreads(member, { tenantKind = "household", spaceKind = null, isAdmin = false } = {}) {
  return tenantKind === "household" ? isAdult(member) : isAdmin === true;
}

/**
 * Pinning and deleting threads is offered to adults: over any thread where they
 * supervise, and over the threads they started themselves where they do not.
 */
export function canModerateThread(thread, member, tenant) {
  return isAdult(member) && (thread.author_id === member.id || supervisesThreads(member, tenant));
}

/**
 * A category colour as it may be written into a style attribute: a hex colour,
 * or the fallback. The column is plain text any adult can write, so anything
 * else is not drawn.
 */
export function safeColor(color, fallback = "#6b7280") {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

/**
 * The name to show for whoever wrote a thread or reply. `author_id` is set by
 * the hub and cannot be forged; `author_name` is whatever the writer sent, so
 * it is used only for someone no longer on the roster.
 */
export function authorName(row, members = []) {
  const member = members.find(m => m.id === row.author_id);
  return member?.name ?? row.author_name ?? "Former member";
}

/**
 * Wraps a load so that only the latest call's answer is ever kept.
 *
 * `load(key, options)` fetches; `commit(key, result, options)` puts the answer
 * into the page. Each call takes the next number, and a call's answer is
 * committed only if no newer call has been made since. An answer that arrives
 * late is dropped before it can change anything, and nothing is committed for a
 * load that failed: the page stays exactly as it was.
 *
 * Resolves true when the answer was committed, false when a newer call
 * superseded it (a superseded failure is dropped too). A failure of the latest
 * call is thrown to the caller.
 *
 * `generation()` is the number of the latest call, for work that must notice a
 * newer load without starting one. `cancel()` supersedes whatever is in flight
 * without loading anything: for when the member's latest choice is what is
 * already on the page, so an earlier, slower choice must not land over it.
 */
export function createLatestLoader({ load, commit }) {
  let seq = 0;
  async function run(key, options) {
    const mine = ++seq;
    let result;
    try {
      result = await load(key, options);
    } catch (e) {
      if (mine === seq) throw e;
      return false;
    }
    if (mine !== seq) return false;
    commit(key, result, options);
    return true;
  }
  run.generation = () => seq;
  run.cancel = () => { seq++; };
  return run;
}

/**
 * "Retry after a lost response" (app-template guide): whether a failed
 * write's answer leaves its outcome unknown — no status, a 400, or a 5xx
 * other than 507 — so the page reads the row back by its pinned id. A
 * `UNIQUE_CONSTRAINT` answer is a 400 too: the usual retry of a create that
 * landed collides on its own pinned id. Only finding the row under that id
 * says it landed; not found keeps the "already exists" line.
 */
export function outcomeUnknown(e) {
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return true;
  const status = Number(e?.status) || 0;
  return status === 0 || status === 400 || (status >= 500 && status !== 507);
}

/**
 * Whether a stored row differs from what the form holds now, over the form's
 * own fields only, compared as text with a missing value as empty.
 */
export function storedDiffers(row, fields) {
  return Object.keys(fields).some((k) => String(row?.[k] ?? "") !== String(fields[k] ?? ""));
}

export const SAVED_AS_FIRST = "Saved as first entered — check it and update what changed.";

/**
 * The line a failed write shows ("Refused, gone, or failed" in the app-template
 * guide): "try again" only when retrying can work. `action` and `thing` are the
 * app's own words ("post the thread", "thread"). An error the app worded for the
 * user (`forUser`) keeps its message. Decided from the error's `status` /
 * `code`, never from the hub's text.
 *
 * `found` is the caller's re-read after a write that changed nothing: false —
 * the row is gone; true — it is still there, which on this app's plain
 * `WHERE id = ?` writes means the row policy narrowed the write away; null —
 * the re-read itself failed.
 */
export function failureLine(e, { action, thing, found } = {}) {
  if (e?.forUser) return e.message;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return `That ${thing} already exists.`;
  if (e?.status === 403 || found === true) return `You don’t have permission to ${action}.`;
  if (e?.status === 507) return "The household’s storage is full — free up space first.";
  if (e?.status === 429) return "Too many tries — wait a minute and try again.";
  if (found === null) return `Couldn’t ${action} — try again.`;
  if (found === false || e?.status === 404) return `This ${thing} has been removed.`;
  if (e?.status === 409) return `This ${thing} was changed by someone else — check it first.`;
  return `Couldn’t ${action} — try again.`;
}
