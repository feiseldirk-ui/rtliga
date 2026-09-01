// Isolated PostgreSQL/PGlite checks with synthetic accounts. No network/production.
// PGLITE_MODULES=/path/to/node_modules node tests/check-club-session-sql.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.env.PGLITE_MODULES;
if (!root) throw new Error('PGLITE_MODULES fehlt.');
const { PGlite } = await import(pathToFileURL(root + '/@electric-sql/pglite/dist/index.js'));
const db = new PGlite();
const file = name => readFile(new URL('../supabase/sql/' + name, import.meta.url), 'utf8');
const install = await file('vereinssperre_installieren.sql');
let checks = 0;
const ok = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const deny = async (fn, code) => { await assert.rejects(fn, e => e.code === code); checks++; };
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const clubA = id(1), clubB = id(2), userA = id(11), userB = id(12), admin = id(13);
const s1 = id(21), s2 = id(22), s3 = id(23), sb = id(24), sa = id(25), s4 = id(26);
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
create table public.admins(user_id uuid,role text);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admins where user_id=auth.uid() and role='admin') $$;
create table public.vereine(id uuid primary key,user_id uuid,vereinsname text);
create table public.verein_teilnehmer(id bigint generated always as identity primary key,
 verein_id uuid references public.vereine(id),vorname text,name text,altersklasse text,saison text);
create table public.verein_ergebnisse(id integer generated always as identity primary key,
 verein_id uuid references public.vereine(id),verein text,vorname text,nachname text,altersklasse text,
 wettkampf integer,s1 integer,s2 integer,s3 integer,s4 integer,s5 integer,s6 integer,ll integer,sl integer,
 gesamt integer,status text,ergebnis text,saison text);
insert into public.vereine values('${clubA}','${userA}','Testverein A'),('${clubB}','${userB}','Testverein B');
insert into public.admins values('${admin}','admin');
insert into auth.sessions(id,user_id) values('${s1}','${userA}'),('${s2}','${userA}'),('${s3}','${userA}'),
 ('${sb}','${userB}'),('${sa}','${admin}'),('${s4}','${userA}');
alter table public.vereine enable row level security;
create policy own_club on public.vereine to authenticated using(user_id=auth.uid() or public.is_admin())
 with check(user_id=auth.uid() or public.is_admin());
grant usage on schema public,auth to authenticated,anon,service_role;
grant all on all tables in schema public to authenticated,service_role;
grant usage on all sequences in schema public to authenticated,service_role;
`);
for (const table of ['verein_teilnehmer','verein_ergebnisse']) await db.exec(`
 alter table public.${table} enable row level security;
 create policy own_rows on public.${table} to authenticated
 using(public.is_admin() or exists(select 1 from public.vereine v where v.id=verein_id and v.user_id=auth.uid()))
 with check(public.is_admin() or exists(select 1 from public.vereine v where v.id=verein_id and v.user_id=auth.uid()));
`);
await db.exec(await file('014_save_verein_ergebnisse_rpc.sql'));
const policies = (await db.query('select * from pg_policies order by tablename,policyname')).rows;
await db.exec(install);
await db.exec(install); checks++;
ok((await db.query('select * from pg_policies order by tablename,policyname')).rows, policies,'Original RLS preserved');
const as = async (user, session, role = 'authenticated') => {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:user,session_id:session,role})]);
 await db.exec('set role ' + role);
};
const maintenance = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims','{}',false)"); };
const rpc = async (action, club=clubA) => (await db.query('select public.rtliga_club_session_v1($1,$2) r',[action,club])).rows[0].r;
const add = (club=clubA) => db.query("insert into public.verein_teilnehmer(verein_id,vorname,name,altersklasse,saison) values($1,'Test','Person','AK','2026') returning id",[club]);
const result = () => db.query("select public.save_verein_ergebnis($1,'Test','Person','AK',1,1,1,1,1,1,1,1,1,8,'','',2026)",[clubA]);
await as(userA,s1);
await deny(() => add(),'PT401');
ok((await rpc('renew')).allowed,false,'No implicit lease on renew');
ok((await rpc('acquire')).allowed,true,'First device accepted');
ok((await rpc('renew')).lease_ms,600000,'Heartbeat');
ok((await rpc('acquire')).allowed,true,'Same live session idempotent');
await add(); checks++;
await result(); checks++;
await result(); checks++;
await db.exec("update public.verein_teilnehmer set altersklasse='AK' where verein_id='"+clubA+"'"); checks++;
await deny(() => db.query('update public.vereine set user_id=$1 where id=$2',[userB,clubA]),'PT403');
await deny(() => db.query('update public.verein_teilnehmer set verein_id=$1 where verein_id=$2',[clubB,clubA]),'PT403');
await deny(() => add(clubB),'PT403');
ok((await rpc('acquire',clubB)).allowed,false,'Cannot claim foreign club');
await as(userA,s2);
ok((await rpc('acquire')).reason,'busy','Second device rejected');
ok((await rpc('release')).allowed,false,'Second device cannot release first');
await deny(() => add(),'PT401');
await deny(() => result(),'PT401');
await deny(() => db.exec("update public.verein_ergebnisse set gesamt=999"),'PT401');
await deny(() => db.exec('delete from public.verein_teilnehmer'),'PT401');
await deny(() => db.exec("update public.vereine set vereinsname='Changed'"),'PT401');
await deny(() => db.exec('select * from rtliga_session_private.club_leases'),'42501');
await deny(() => db.exec("update rtliga_session_private.club_leases set expires_at='infinity'"),'42501');
await deny(() => db.exec('select rtliga_session_private.verified_session_id()'),'42501');
await deny(() => rpc('invalid'),'22023');
await as(userB,sb);
ok((await rpc('acquire',clubB)).allowed,true,'Other club independent');
await add(clubB); checks++;
await as(admin,sa);
await db.exec('update public.verein_ergebnisse set gesamt=9'); checks++;
await db.exec("update public.vereine set vereinsname='Testverein A' where id='"+clubA+"'"); checks++;
await as(userA,s1);
ok((await rpc('release')).allowed,true,'Owner release');
await deny(() => result(),'PT401');
ok((await rpc('acquire')).reason,'ended','Released session cannot revive');
await as(userA,s2);
ok((await rpc('acquire')).allowed,true,'New device after release');
await result(); checks++;
await maintenance();
await db.query("update rtliga_session_private.club_leases set expires_at=clock_timestamp()-interval '1 second' where verein_id=$1",[clubA]);
await as(userA,s2);
ok((await rpc('renew')).allowed,false,'Expired heartbeat rejected');
ok((await rpc('acquire')).allowed,false,'Expired acquire rejected');
await deny(() => result(),'PT401');
await as(userA,s3);
ok((await rpc('acquire')).allowed,true,'Fresh session after expiry');
await maintenance();
await db.query('delete from auth.sessions where id=$1',[s3]);
await as(userA,s3);
ok((await rpc('renew')).allowed,false,'Revoked auth rejected');
await deny(() => result(),'PT403');
await as(userA,s4);
ok((await rpc('acquire')).allowed,true,'Fresh session after revoked owner');
await maintenance();
await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[s4]);
await as(userA,s4);
ok((await rpc('renew')).allowed,false,'Auth not_after respected');
await as(userA,sb);
ok((await rpc('acquire')).allowed,false,'Session must belong to JWT user');
await as(userA,'not-a-uuid');
ok((await rpc('acquire')).allowed,false,'Malformed session');
await as(userA,null);
ok((await rpc('acquire')).allowed,false,'Missing session');
await as(null,null);
ok((await rpc('acquire')).allowed,false,'No user');
await deny(() => add(),'PT403');
await as(null,null,'anon');
await deny(() => rpc('acquire'),'42501');
await maintenance();
await db.exec("insert into public.verein_teilnehmer(verein_id,name) values('"+clubA+"','Maintenance')"); checks++;
const verification = await db.exec(await file('vereinssperre_pruefen.sql'));
for (const part of verification) for (const row of part.rows) for (const [key,value] of Object.entries(row)) {
 if (typeof value === 'boolean') ok(value,true,key);
}
await as(userA,s1);
await db.query('insert into public.vereine(id,user_id,vereinsname) values($1,$2,$3)',[id(99),userA,'Registration fixture']); checks++;
await maintenance();
const dataBefore = (await db.query('select * from public.verein_ergebnisse order by id')).rows;
const historyBefore = (await db.query('select * from rtliga_session_private.used_sessions order by session_id')).rows;
await db.exec(await file('vereinssperre_rueckweg_NUR_BEI_ABBRUCH.sql'));
ok((await db.query("select count(*)::int n from pg_trigger where tgname='rtliga_session_guard'")).rows[0].n,0,'Rollback removes guards');
ok((await db.query('select * from public.verein_ergebnisse order by id')).rows,dataBefore,'Rollback preserves results');
await db.exec(install);
ok((await db.query('select * from rtliga_session_private.used_sessions order by session_id')).rows,historyBefore,'Reinstall preserves ended sessions');
await as(userA,s1);
ok((await rpc('acquire')).allowed,false,'Old session still blocked after reinstall');
await db.close();
console.log(checks+' isolated SQL assertions passed. Real parallel/browser tests remain separate.');
