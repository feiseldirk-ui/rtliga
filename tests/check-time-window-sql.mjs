// Lokale SQL-Prüfung ohne Live-Zugangsdaten.
// PGLITE_MODULES=/pfad/node_modules node tests/check-time-window-sql.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.env.PGLITE_MODULES;
if (!root) throw new Error('PGLITE_MODULES fehlt.');
const { PGlite } = await import(pathToFileURL(root + '/@electric-sql/pglite/dist/index.js'));
const { btree_gist } = await import(pathToFileURL(root + '/@electric-sql/pglite/dist/contrib/btree_gist.js'));
const db = new PGlite({ extensions: { btree_gist } });
let checks = 0;
const migration = await readFile(new URL('../supabase/migrations/20260901104943_admin_wk_windows_safe.sql', import.meta.url), 'utf8');
await db.exec(
"create role anon; create role authenticated; create schema auth;" +
"create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;" +
"create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true) = 'yes', false) $$;" +
"create table public.zeitfenster(id bigint generated always as identity primary key, start text, ende text, wettkampf integer, saison text not null default '2026', unique(saison,wettkampf));" +
"alter table public.zeitfenster enable row level security;" +
"create policy read_windows on public.zeitfenster for select to authenticated using(true);" +
"create policy write_windows on public.zeitfenster for all to authenticated using(public.is_admin()) with check(public.is_admin());" +
"grant usage on schema public,auth to authenticated; grant all on public.zeitfenster to authenticated; grant usage on all sequences in schema public to authenticated;"
);
await db.exec(migration);
await db.exec(migration);
checks++;
await db.exec("set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001'; set test.admin='yes'");
const snap = row => row ? { id: row.id, start: row.start, ende: row.ende } : null;
const save = async (wk, start, ende, expected = null, reset = false, season = '2026') =>
  (await db.query('select public.admin_save_wk_window($1,$2,$3,$4,$5::jsonb,$6) as result',
    [season,wk,start,ende,JSON.stringify(expected),reset])).rows[0].result;
async function rejects(fn, code) {
  await assert.rejects(fn, error => error.code === code);
  checks++;
}
let wk1 = await save(1,'2026-09-01T08:00:00Z','2026-09-01T10:00:00Z');
assert.equal(wk1.row.saison,'2026'); checks++;
await rejects(() => save(2,'2026-09-01T09:00:00Z','2026-09-01T11:00:00Z'),'23P01');
await rejects(() => save(2,'2026-09-01T10:00:00Z','2026-09-01T11:00:00Z'),'23P01');
const wk2 = await save(2,'2026-09-01T10:01:00Z','2026-09-01T11:00:00Z'); checks++;
await save(1,'2026-09-01T08:00:00Z','2026-09-01T10:00:00Z',null,false,'2027'); checks++;
await rejects(() => save(1,'2026-09-02T08:00:00Z','2026-09-02T10:00:00Z'),'40001');
const old = wk1.row;
wk1 = await save(1,'2026-09-02T08:00:00Z','2026-09-02T10:00:00Z',snap(old)); checks++;
await rejects(() => save(1,'2026-09-03T08:00:00Z','2026-09-03T10:00:00Z',snap(old)),'40001');
await rejects(() => save(1,null,null,snap(old),true),'40001');
await rejects(() => save(3,'2026-10-01T10:00:00Z','2026-10-01T09:00:00Z'),'22023');
await rejects(() => save(3,'2026-10-01T10:00:00Z',null),'22023');
await rejects(() => save(3,'2026-10-01T10:00','2026-10-01T11:00'),'22023');
await rejects(() => save(10,'2026-10-01T10:00:00Z','2026-10-01T11:00:00Z'),'22023');
await rejects(() => db.exec("insert into zeitfenster(saison,wettkampf,start,ende) values('2026',3,'2026-09-02T08:30:00Z','2026-09-02T09:00:00Z')"),'23P01');
await rejects(() => db.exec("update zeitfenster set start='2026-09-02T08:30:00Z', ende='2026-09-02T09:00:00Z',start_ts=null,ende_ts=null where saison='2026' and wettkampf=2"),'23P01');
const removed = await save(1,null,null,snap(wk1.row),true);
assert.equal(removed.row,null); checks++;
await rejects(() => save(1,null,null,null,true),'22023');
const again = await save(1,'2026-09-02T08:00:00Z','2026-09-02T10:00:00Z');
assert.notEqual(again.row.id,wk1.row.id); checks++;
await db.exec("insert into zeitfenster(saison,wettkampf,start,ende) values('2026',4,'2026-12-01T10:00','2026-12-01T11:00')");
const parsed = (await db.query("select start_ts,start from zeitfenster where saison='2026' and wettkampf=4")).rows[0];
assert.equal(new Date(parsed.start_ts).toISOString(),'2026-12-01T09:00:00.000Z'); checks++;
assert.equal(parsed.start,'2026-12-01T09:00:00.000Z'); checks++;
await db.exec("set test.admin='no'");
await rejects(() => save(2,null,null,snap(wk2.row),true),'42501');
await db.exec('reset role; set role anon');
await rejects(() => save(2,null,null,snap(wk2.row),true),'42501');
await db.exec('reset role');
assert.equal((await db.query("select count(*)::int n from zeitfenster where saison='2026' and wettkampf=2")).rows[0].n,1); checks++;
await db.close();
for (const legacy of [
  "('2026',1,'2026-01-02T10:00','2026-01-01T10:00')",
  "('2026',1,'2026-01-01T10:00','2026-01-01T12:00'),('2026',2,'2026-01-01T11:00','2026-01-01T13:00')",
]) {
  const bad = new PGlite({ extensions: { btree_gist } });
  await bad.exec("create role anon; create role authenticated; create table public.zeitfenster(id bigint generated always as identity primary key, start text, ende text, wettkampf integer, saison text not null, unique(saison,wettkampf)); insert into zeitfenster(saison,wettkampf,start,ende) values " + legacy);
  const before = (await bad.query('select * from zeitfenster order by id')).rows;
  await assert.rejects(() => bad.exec(migration));
  await bad.exec('rollback');
  assert.deepEqual((await bad.query('select * from zeitfenster order by id')).rows,before);
  checks++;
  await bad.close();
}
console.log(checks + ' lokale SQL-Prüfungen bestanden.');
