import { describe, it, expect } from "vitest";
import {
  memberColor, initial, esc, AVATAR_COLORS,
  applyInline, renderMarkdown, stripMarkdown,
  formatRelativeDate,
  groupReactions, hasReacted, reactionSummary,
  sortThreads, isAdult, searchableFields, supervisesReplies, canDeleteReply,
  supervisesThreads, canModerateThread,
  safeColor, authorName,
  createLatestLoader,
} from "../src/logic.js";

// ── memberColor / initial ─────────────────────────────────────────────────────
describe("memberColor", () => {
  it("returns a color from AVATAR_COLORS", () => {
    expect(AVATAR_COLORS).toContain(memberColor("member-1"));
  });
  it("is stable for the same id", () => {
    expect(memberColor("abc")).toBe(memberColor("abc"));
  });
  it("varies across ids", () => {
    const colors = new Set(["a","b","c","d","e","f","g","h"].map(memberColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("initial", () => {
  it("uppercases the first letter", () => { expect(initial("alice")).toBe("A"); });
  it("handles leading whitespace",   () => { expect(initial("  bob")).toBe("B"); });
  it("returns ? for empty string",   () => { expect(initial("")).toBe("?"); });
});

// ── esc ───────────────────────────────────────────────────────────────────────
describe("esc", () => {
  it("escapes &, <, >, \"", () => {
    expect(esc('A & B < C > D "E"')).toBe("A &amp; B &lt; C &gt; D &quot;E&quot;");
  });
  it("passes through plain text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });
  it("coerces numbers to string", () => {
    expect(esc(42)).toBe("42");
  });
});

// ── applyInline ───────────────────────────────────────────────────────────────
describe("applyInline", () => {
  it("wraps **text** in <strong>", () => {
    expect(applyInline("**bold**")).toBe("<strong>bold</strong>");
  });
  it("wraps *text* in <em>", () => {
    expect(applyInline("*italic*")).toBe("<em>italic</em>");
  });
  it("wraps ~~text~~ in <s>", () => {
    expect(applyInline("~~strike~~")).toBe("<s>strike</s>");
  });
  it("wraps `code` in <code>", () => {
    expect(applyInline("`foo`")).toBe("<code>foo</code>");
  });
  it("converts [text](https://url) to anchor", () => {
    const result = applyInline("[click](https://example.com)");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain("click");
    expect(result).toContain('target="_blank"');
  });
  it("ignores non-http links for security", () => {
    expect(applyInline("[evil](javascript:alert(1))")).not.toContain("<a");
  });
  it("handles multiple inline elements", () => {
    const result = applyInline("**bold** and *italic*");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
  });
});

// ── renderMarkdown ────────────────────────────────────────────────────────────
describe("renderMarkdown", () => {
  it("returns empty string for falsy input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
  });

  it("wraps plain text in <p>", () => {
    expect(renderMarkdown("Hello")).toContain("<p>Hello</p>");
  });

  it("renders headings", () => {
    expect(renderMarkdown("# H1")).toContain("<h1>H1</h1>");
    expect(renderMarkdown("## H2")).toContain("<h2>H2</h2>");
    expect(renderMarkdown("### H3")).toContain("<h3>H3</h3>");
  });

  it("renders blockquote", () => {
    expect(renderMarkdown("> quote")).toContain("<blockquote>");
  });

  it("renders unordered list", () => {
    const html = renderMarkdown("- item1\n- item2");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
  });

  it("renders ordered list", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
  });

  it("renders fenced code block", () => {
    const html = renderMarkdown("```\nconst x = 1;\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const x = 1;");
  });

  it("HTML-escapes content inside code blocks", () => {
    const html = renderMarkdown("```\n<script>\n```");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("HTML-escapes user content in paragraphs", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("applies inline transforms inside block elements", () => {
    const html = renderMarkdown("## **bold heading**");
    expect(html).toContain("<strong>bold heading</strong>");
  });
});

// ── stripMarkdown ─────────────────────────────────────────────────────────────
describe("stripMarkdown", () => {
  it("removes heading syntax", () => {
    expect(stripMarkdown("# Hello")).toBe("Hello");
  });
  it("removes bold/italic markers", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });
  it("removes code blocks", () => {
    expect(stripMarkdown("```\ncode\n```")).toBe("");
  });
  it("removes inline code", () => {
    expect(stripMarkdown("`foo`")).toBe("foo");
  });
  it("removes list markers", () => {
    expect(stripMarkdown("- item")).toBe("item");
  });
  it("removes link syntax, keeping text", () => {
    expect(stripMarkdown("[click here](https://example.com)")).toBe("click here");
  });
  it("collapses newlines to spaces", () => {
    const result = stripMarkdown("line one\nline two");
    expect(result).toBe("line one line two");
  });
});

// ── formatRelativeDate ────────────────────────────────────────────────────────
describe("formatRelativeDate", () => {
  function ago(ms) { return new Date(Date.now() - ms).toISOString(); }

  it("returns 'just now' for under a minute", () => {
    expect(formatRelativeDate(ago(30_000))).toBe("just now");
  });
  it("returns minutes for under an hour", () => {
    expect(formatRelativeDate(ago(5 * 60_000))).toBe("5m ago");
  });
  it("returns hours for under 24 hours", () => {
    expect(formatRelativeDate(ago(3 * 3_600_000))).toBe("3h ago");
  });
  it("returns 'yesterday' for ~1 day ago", () => {
    expect(formatRelativeDate(ago(25 * 3_600_000))).toBe("yesterday");
  });
});

// ── groupReactions / hasReacted / reactionSummary ─────────────────────────────
describe("groupReactions", () => {
  const rows = [
    { target_id: "t1", emoji: "👍", author_id: "m1" },
    { target_id: "t1", emoji: "👍", author_id: "m2" },
    { target_id: "t1", emoji: "❤️", author_id: "m1" },
    { target_id: "t2", emoji: "😂", author_id: "m3" },
  ];

  it("groups by target and emoji", () => {
    const map = groupReactions(rows);
    expect(map["t1"]["👍"].count).toBe(2);
    expect(map["t1"]["❤️"].count).toBe(1);
    expect(map["t2"]["😂"].count).toBe(1);
  });

  it("collects author IDs", () => {
    const map = groupReactions(rows);
    expect(map["t1"]["👍"].authorIds).toContain("m1");
    expect(map["t1"]["👍"].authorIds).toContain("m2");
  });

  it("returns empty object for empty input", () => {
    expect(groupReactions([])).toEqual({});
  });
});

describe("hasReacted", () => {
  const map = groupReactions([{ target_id: "t1", emoji: "👍", author_id: "m1" }]);

  it("returns true when member has reacted", () => {
    expect(hasReacted(map, "t1", "👍", "m1")).toBe(true);
  });
  it("returns false when member has not reacted", () => {
    expect(hasReacted(map, "t1", "👍", "m2")).toBe(false);
  });
  it("returns false for unknown target", () => {
    expect(hasReacted(map, "t99", "👍", "m1")).toBe(false);
  });
});

describe("reactionSummary", () => {
  const rows = [
    { target_id: "t1", emoji: "👍", author_id: "m1" },
    { target_id: "t1", emoji: "👍", author_id: "m2" },
    { target_id: "t1", emoji: "❤️", author_id: "m1" },
  ];

  it("returns emoji+count pairs sorted by count desc", () => {
    const map     = groupReactions(rows);
    const summary = reactionSummary(map, "t1");
    expect(summary[0].emoji).toBe("👍");
    expect(summary[0].count).toBe(2);
    expect(summary[1].emoji).toBe("❤️");
    expect(summary[1].count).toBe(1);
  });

  it("returns empty array for a target with no reactions", () => {
    expect(reactionSummary({}, "t99")).toEqual([]);
  });
});

// ── sortThreads ───────────────────────────────────────────────────────────────
describe("sortThreads", () => {
  const threads = [
    { id: "a", pinned: false, created_at: "2025-01-01T10:00:00Z" },
    { id: "b", pinned: true,  created_at: "2025-01-01T09:00:00Z" },
    { id: "c", pinned: false, created_at: "2025-01-02T10:00:00Z" },
  ];

  it("places pinned threads first", () => {
    const sorted = sortThreads(threads);
    expect(sorted[0].id).toBe("b");
  });

  it("sorts non-pinned threads newest-first", () => {
    const sorted = sortThreads(threads);
    expect(sorted[1].id).toBe("c");
    expect(sorted[2].id).toBe("a");
  });

  it("does not mutate the input array", () => {
    const copy = [...threads];
    sortThreads(threads);
    expect(threads).toEqual(copy);
  });
});

// ── isAdult ───────────────────────────────────────────────────────────────────
describe("isAdult", () => {
  it("returns true for adults", () => {
    expect(isAdult({ role: "adult" })).toBe(true);
  });
  it("returns true for admins", () => {
    expect(isAdult({ role: "admin" })).toBe(true);
  });
  it("returns false for children", () => {
    expect(isAdult({ role: "child" })).toBe(false);
  });
  it("returns false for null/undefined", () => {
    expect(isAdult(null)).toBe(false);
    expect(isAdult(undefined)).toBe(false);
  });
});

describe("searchableFields", () => {
  it("matches on the thread body and its author, not just the title", () => {
    const fields = searchableFields({
      title: "Weekend plans", body: "anyone want to split a skip hire?", author_name: "Ada",
    });
    expect(fields).toContain("anyone want to split a skip hire?");
    expect(fields).toContain("Ada");
  });
});

// ── reply deletion ────────────────────────────────────────────────────────────
describe("supervisesReplies", () => {
  const adult = { id: "a1", role: "adult" };
  const child = { id: "c1", role: "child" };

  it("every adult supervises in a household, which is the default", () => {
    expect(supervisesReplies(adult)).toBe(true);
    expect(supervisesReplies(child)).toBe(false);
  });

  it("only the steward supervises in a shared space", () => {
    expect(supervisesReplies(adult, { tenantKind: "shared_space", spaceKind: "general", isAdmin: false })).toBe(false);
    expect(supervisesReplies(adult, { tenantKind: "shared_space", spaceKind: "general", isAdmin: true })).toBe(true);
  });

  it("nobody supervises in a co-parenting space, steward or not", () => {
    expect(supervisesReplies(adult, { tenantKind: "shared_space", spaceKind: "coparenting", isAdmin: true })).toBe(false);
  });
});

describe("canDeleteReply", () => {
  const reply = { id: "r1", author_id: "m1" };
  const participant = { tenantKind: "shared_space", spaceKind: "general", isAdmin: false };

  it("lets the author delete their own reply anywhere", () => {
    expect(canDeleteReply(reply, { id: "m1", role: "child" })).toBe(true);
    expect(canDeleteReply(reply, { id: "m1", role: "adult" }, participant)).toBe(true);
  });

  it("lets a household adult delete someone else's, and not a child", () => {
    expect(canDeleteReply(reply, { id: "m2", role: "adult" })).toBe(true);
    expect(canDeleteReply(reply, { id: "m2", role: "child" })).toBe(false);
  });

  it("does not let a participant adult in a shared space delete someone else's", () => {
    expect(canDeleteReply(reply, { id: "m2", role: "adult" }, participant)).toBe(false);
  });

  it("is false with nobody signed in", () => {
    expect(canDeleteReply(reply, null)).toBe(false);
  });
});

// ── thread pin / delete ───────────────────────────────────────────────────────
describe("supervisesThreads", () => {
  const adult = { id: "a1", role: "adult" };
  const child = { id: "c1", role: "child" };

  it("every adult supervises in a household, which is the default", () => {
    expect(supervisesThreads(adult)).toBe(true);
    expect(supervisesThreads(child)).toBe(false);
    expect(supervisesThreads(null)).toBe(false);
  });

  it("only the steward supervises in a shared space", () => {
    expect(supervisesThreads(adult, { tenantKind: "shared_space", spaceKind: "general", isAdmin: false })).toBe(false);
    expect(supervisesThreads(adult, { tenantKind: "shared_space", spaceKind: "general", isAdmin: true })).toBe(true);
  });

  it("a co-parenting steward supervises threads, unlike replies", () => {
    const coparenting = { tenantKind: "shared_space", spaceKind: "coparenting", isAdmin: true };
    expect(supervisesThreads(adult, coparenting)).toBe(true);
    expect(supervisesReplies(adult, coparenting)).toBe(false);
  });
});

describe("canModerateThread", () => {
  const thread = { id: "t1", author_id: "m1" };
  const participant = { tenantKind: "shared_space", spaceKind: "general", isAdmin: false };
  const steward = { tenantKind: "shared_space", spaceKind: "general", isAdmin: true };

  it("lets any household adult moderate any thread", () => {
    expect(canModerateThread(thread, { id: "m2", role: "adult" })).toBe(true);
    expect(canModerateThread(thread, { id: "m1", role: "adult" })).toBe(true);
  });

  it("does not let a child moderate, even their own thread", () => {
    expect(canModerateThread(thread, { id: "m2", role: "child" })).toBe(false);
    expect(canModerateThread(thread, { id: "m1", role: "child" })).toBe(false);
  });

  it("lets a space participant moderate only the threads they started", () => {
    expect(canModerateThread(thread, { id: "m1", role: "adult" }, participant)).toBe(true);
    expect(canModerateThread(thread, { id: "m2", role: "adult" }, participant)).toBe(false);
  });

  it("lets a space steward moderate someone else's thread", () => {
    expect(canModerateThread(thread, { id: "m2", role: "adult" }, steward)).toBe(true);
  });

  it("is false with nobody signed in", () => {
    expect(canModerateThread(thread, null)).toBe(false);
  });
});

describe("safeColor", () => {
  it("keeps a hex colour", () => {
    expect(safeColor("#3b82f6")).toBe("#3b82f6");
    expect(safeColor("#fff")).toBe("#fff");
  });

  it("replaces anything that is not a hex colour", () => {
    expect(safeColor('red"><img src=x onerror=alert(1)>')).toBe("#6b7280");
    expect(safeColor("#3b82f6;background:url(x)")).toBe("#6b7280");
    expect(safeColor(null)).toBe("#6b7280");
    expect(safeColor(undefined, "#000")).toBe("#000");
  });
});

describe("authorName", () => {
  const members = [{ id: "m1", name: "Alex" }];

  it("uses the roster name for the row's author id, whatever name the row carries", () => {
    expect(authorName({ author_id: "m1", author_name: "Someone Else" }, members)).toBe("Alex");
  });

  it("falls back to the stored name for someone no longer on the roster", () => {
    expect(authorName({ author_id: "gone", author_name: "Jordan" }, members)).toBe("Jordan");
  });

  it("names nobody when there is neither", () => {
    expect(authorName({ author_id: "gone" }, [])).toBe("Former member");
  });
});

describe("createLatestLoader", () => {
  /** A load whose answers the test releases by hand, in any order. */
  function harness() {
    const pending = {};
    const committed = [];
    const run = createLatestLoader({
      load: (key) => new Promise((resolve, reject) => { pending[key] = { resolve, reject }; }),
      commit: (key, result) => committed.push([key, result]),
    });
    return { run, pending, committed };
  }

  it("commits the answer of a load that succeeds", async () => {
    const { run, pending, committed } = harness();
    const done = run("a");
    pending.a.resolve("rows-a");
    expect(await done).toBe(true);
    expect(committed).toEqual([["a", "rows-a"]]);
  });

  it("commits nothing when the load fails, and throws the failure", async () => {
    const { run, pending, committed } = harness();
    const done = run("b");
    pending.b.reject(new Error("offline"));
    await expect(done).rejects.toThrow("offline");
    expect(committed).toEqual([]);
  });

  it("drops an answer that arrives after a newer call, whatever order they land in", async () => {
    const { run, pending, committed } = harness();
    const first = run("a");
    const second = run("b");
    pending.b.resolve("rows-b");
    expect(await second).toBe(true);
    pending.a.resolve("rows-a");
    expect(await first).toBe(false);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("drops a superseded failure without throwing", async () => {
    const { run, pending, committed } = harness();
    const first = run("a");
    const second = run("b");
    pending.a.reject(new Error("offline"));
    expect(await first).toBe(false);
    pending.b.resolve("rows-b");
    expect(await second).toBe(true);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("can load the same key again after it failed", async () => {
    const { run, pending, committed } = harness();
    const failed = run("b");
    pending.b.reject(new Error("offline"));
    await expect(failed).rejects.toThrow();
    const retry = run("b");
    pending.b.resolve("rows-b");
    expect(await retry).toBe(true);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("cancel drops a load in flight, so going back to what is shown is the choice that wins", async () => {
    const { run, pending, committed } = harness();
    const done = run("b");
    run.cancel();
    pending.b.resolve("rows-b");
    expect(await done).toBe(false);
    expect(committed).toEqual([]);
  });

  it("cancel drops a failure in flight too, and a later load still commits", async () => {
    const { run, pending, committed } = harness();
    const dropped = run("b");
    run.cancel();
    pending.b.reject(new Error("offline"));
    expect(await dropped).toBe(false);
    const next = run("c");
    pending.c.resolve("rows-c");
    expect(await next).toBe(true);
    expect(committed).toEqual([["c", "rows-c"]]);
  });

  it("passes options through and reports the latest call's number", async () => {
    const seen = [];
    const run = createLatestLoader({
      load: async (key, options) => { seen.push(["load", key, options]); return 1; },
      commit: (key, result, options) => seen.push(["commit", key, options]),
    });
    expect(run.generation()).toBe(0);
    await run("a", { fresh: true });
    expect(run.generation()).toBe(1);
    expect(seen).toEqual([["load", "a", { fresh: true }], ["commit", "a", { fresh: true }]]);
  });
});
