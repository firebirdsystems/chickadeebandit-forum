import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const VALID_STORAGE   = ["kv", "db", "none"];
const VALID_AUDIENCES = ["everyone", "adults", "children"];

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });

  it("entrypoint is index.html", () => expect(manifest.entrypoint).toBe("index.html"));
  it("runtime is static",        () => expect(manifest.runtime).toBe("static"));

  it("storage is declared and valid", () => {
    expect(manifest.storage, "storage field is required").toBeTruthy();
    expect(VALID_STORAGE).toContain(manifest.storage);
  });

  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));

  it("permissions.default_audience is valid", () => {
    expect(VALID_AUDIENCES).toContain(manifest.permissions.default_audience);
  });

  it("permissions.requires_approval is boolean", () => {
    expect(typeof manifest.permissions.requires_approval).toBe("boolean");
  });

  it("data_access has reads and writes arrays", () => {
    expect(Array.isArray(manifest.data_access.reads)).toBe(true);
    expect(Array.isArray(manifest.data_access.writes)).toBe(true);
  });
});

// ── write_effects ────────────────────────────────────────────────────────────
// reply_count/reaction_count are maintained by hub-appended effect SQL. Three
// things about that pairing fail LATE and quietly if they drift, so they are
// pinned here rather than discovered at publish or in production:
//
//  1. an effect may not assign a derived value to an encrypted column, so every
//     column an effect computes must be in db_plaintext_columns (admission
//     refuses the app otherwise — a failed release, not a failed test);
//  2. the effect is only half the mechanism: without `writable_by: []` on the
//     counter columns, any member could still forge a total by hand;
//  3. declaring insert effects CONSTRAINS this app's own client SQL from that
//     release on — every INSERT into a trigger table must be single-row VALUES
//     with named columns, no upsert, and must name the `:new` column the effect
//     reads. Admission cannot see the bundle's SQL, so nothing warns at publish:
//     a drifted INSERT starts 400ing the moment the release installs.
describe("write_effects", () => {
  const effects = manifest.write_effects ?? {};
  const sources = ["../src/index.html", "../src/widget.html"]
    .map((f) => readFileSync(join(__dirname, f), "utf-8")).join("\n");
  const prefix = `app_${manifest.id.replace(/-/g, "_")}__`;
  const all = Object.entries(effects).flatMap(([table, verbs]) =>
    ["insert", "delete"].flatMap((verb) => (verbs[verb] ?? []).map((e) => ({ table, verb, ...e }))));

  it("declares effects on the tables whose counters this app reads", () => {
    expect(Object.keys(effects).sort()).toEqual(["reactions", "replies"]);
  });

  it("computes only plaintext columns, each locked against every client", () => {
    const plaintext = manifest.db_plaintext_columns ?? [];
    for (const effect of all) {
      const [, target, column] = effect.statement.match(/^UPDATE\s+(\w+)\s+SET\s+(\w+)\s*=/) ?? [];
      expect(target, `${effect.label} target`).toBeTruthy();
      expect(plaintext, `${column} is effect-computed`).toContain(column);
      const acl = manifest.row_policies[target.slice(prefix.length)]?.column_write_acls?.[column];
      expect(acl?.writable_by, `${column} must be client-immutable`).toEqual([]);
      // A lock limited to `actions: ["update"]` would still let an INSERT set
      // the column; these columns are never named by an INSERT, so both.
      expect(acl.actions, `${column} lock covers insert and update`).toBeUndefined();
    }
  });

  it("never writes an effect-maintained column from client SQL", () => {
    for (const column of ["reply_count", "reaction_count"]) {
      expect(sources.includes(`SET ${column}`), `client SQL sets ${column}`).toBe(false);
    }
  });

  it("keeps every client INSERT into a trigger table in the shape effects require", () => {
    for (const [table, verbs] of Object.entries(effects)) {
      if (!verbs.insert) continue;
      const needed = verbs.insert.flatMap((e) =>
        [...e.statement.matchAll(/:new\.(\w+)/g)].map((m) => m[1]));
      const inserts = [...sources.matchAll(
        new RegExp(`INSERT(\\s+OR\\s+\\w+)?\\s+INTO\\s+${prefix}${table}\\s*\\(([^)]*)\\)([\\s\\S]{0,300})`, "g"),
      )];
      expect(inserts.length, `no client INSERT into ${table} found — the scan drifted`).toBeGreaterThan(0);
      for (const [, orClause, columns, tail] of inserts) {
        expect(orClause, `INSERT OR … into ${table} is refused on an effect table`).toBeUndefined();
        const named = columns.split(",").map((c) => c.trim());
        for (const column of needed) expect(named, `${table} INSERT must name ${column}`).toContain(column);
        const values = tail.slice(0, tail.indexOf(";") === -1 ? tail.length : tail.indexOf(";"));
        expect(/ON\s+CONFLICT/i.test(values), `${table} INSERT may not upsert`).toBe(false);
        // Single-row VALUES: one tuple, and every cell a `?` param (a subquery
        // or expression in a `:new` cell is refused at runtime).
        const tuples = values.match(/VALUES\s*\((?:\s*\?\s*,)*\s*\?\s*\)/i);
        expect(tuples, `${table} INSERT must be single-row VALUES of ? params`).toBeTruthy();
      }
    }
  });

  it("binds delete effects to a plaintext key column of the trigger table", () => {
    for (const effect of all.filter((e) => e.verb === "delete")) {
      expect(effect.bind, `${effect.label} bind`).toMatch(/_id$/);
      expect(effect.statement).toMatch(/WHERE\s+id\s+IN\s+:affected$/);
      // Recompute, never accumulate: a delete effect's key set is pre-read from
      // committed state, so two clients deleting the same row both fire it.
      expect(effect.statement).not.toMatch(/=\s*\w*count\w*\s*[-+]/i);
    }
  });
});
