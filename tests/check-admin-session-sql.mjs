// Synthetic local PostgreSQL/PGlite checks; never connects to Supabase.
// PGLITE_MODULES=/path/to/node_modules node tests/check-admin-session-sql.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.PGLITE_MODULES) throw Error('PGLITE_MODULES fehlt');
const { PGlite }=await import(pathToFileURL(process.env.PGLITE_MODULES+'/@electric-sql/pglite/dist/index.js'));
const db=new PGlite();
const file=n=>readFile(new URL('../supabase/sql/'+n,import.meta.url),'utf8');
let checks=0;
const ok=(v,e,name)=>{assert.deepEqual(v,e,name);checks++;};
const deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const a=id(1),b=id(2),clubUser=id(3),club=id(4),s1=id(11),s2=id(12),s3=id(13),s4=id(14),sb=id(21),sc=id(31);
await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
 create table public.admins(user_id uuid primary key,email text,role text);
 create table public.vereine(id uuid primary key,user_id uuid,vereinsname text);
 create table public.verein_teilnehmer(id integer primary key,verein_id uuid,value text);
 create table public.verein_ergebnisse(id integer primary key,verein_id uuid,value text);
 create table public.ergebnisse(id integer primary key,value text);
 create table public.zeitfenster(id integer primary key,value text);
 create table public.pdf_layout_settings(id integer primary key,value text);
 create table public.saisons(id integer primary key,value text);
 insert into public.admins values('${a}','a@example.test','admin'),('${b}','b@example.test','admin');
 insert into auth.sessions(id,user_id) values('${s1}','${a}'),('${s2}','${a}'),('${s3}','${a}'),('${s4}','${a}'),('${sb}','${b}'),('${sc}','${clubUser}');
 insert into public.vereine values('${club}','${clubUser}','Synthetic club');
 grant all on all tables in schema public to authenticated,service_role;
`);
// Exact audited bodies (including CRLF); installation deliberately refuses drift.
const originalAdmin="\r\n  select exists (\r\n    select 1\r\n    from public.admins a\r\n    where a.user_id = auth.uid()\r\n      and coalesce(a.role, '') = 'admin'\r\n  );\r\n";
const originalUser="\r\n  select exists (\r\n    select 1\r\n    from public.admins\r\n    where user_id = auth.uid()\r\n  );\r\n";
await db.exec(`create function public.is_admin() returns boolean language sql stable security definer set search_path='public' as $$${originalAdmin}$$;
 create function public.is_admin_user() returns boolean language sql security definer set search_path='public' as $$${originalUser}$$;`);
for(const t of ['admins','vereine','verein_teilnehmer','verein_ergebnisse','ergebnisse','zeitfenster','pdf_layout_settings','saisons']){
 await db.exec(`alter table public.${t} enable row level security;
 create policy admin_access on public.${t} to authenticated using(public.is_admin()) with check(public.is_admin());`);
}
await db.exec(`create policy own_club on public.vereine to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy own_participants on public.verein_teilnehmer to authenticated
 using(verein_id='${club}' and auth.uid()='${clubUser}') with check(verein_id='${club}' and auth.uid()='${clubUser}');
 create policy own_results on public.verein_ergebnisse to authenticated
 using(verein_id='${club}' and auth.uid()='${clubUser}') with check(verein_id='${club}' and auth.uid()='${clubUser}');
 create function public.legacy_admin_write() returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.admins where user_id=auth.uid() and role='admin') then raise exception 'not admin'; end if;
 update public.zeitfenster set value='legacy';end$$;
 create schema storage;create table storage.objects(id integer,value text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;
 create policy assets on storage.objects to authenticated using(public.is_admin()) with check(public.is_admin());
`);
await db.exec(await file('vereinssperre_installieren.sql'));
const policies=(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
const oids=(await db.query("select oid from pg_proc where oid in ('public.is_admin()'::regprocedure,'public.is_admin_user()'::regprocedure) order by oid")).rows;
await db.exec(await file('adminsperre_installieren.sql'));checks++;
ok((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,policies,'Policies preserved');
ok((await db.query("select oid from pg_proc where oid in ('public.is_admin()'::regprocedure,'public.is_admin_user()'::regprocedure) order by oid")).rows,oids,'Role OIDs preserved');
const verification=(await db.query(await file('adminsperre_pruefen.sql'))).rows[0];
for(const [key,value] of Object.entries(verification))ok(value,true,key);
const as=async(user,sid,role='authenticated')=>{
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:sid,role})]);await db.exec('set role '+role);
};
const maintenance=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");};
const rpc=async action=>(await db.query('select public.rtliga_admin_session_v1($1) r',[action])).rows[0].r;
const allowed=async()=>(await db.query('select public.is_admin() a,public.is_admin_user() b')).rows[0];
const write=()=>db.exec("insert into public.zeitfenster values(1,'test') on conflict(id) do update set value='test'");
await as(a,s1);
ok(await allowed(),{a:false,b:false},'Unreserved JWT has no admin authority');
await deny(write,'PT401');
await deny(()=>db.exec('select public.legacy_admin_write()'),'PT401');
ok((await rpc('renew')).allowed,false,'Renew does not acquire');
ok((await rpc('acquire')).allowed,true,'First accepted');
ok(await allowed(),{a:true,b:true},'Accepted admin role enabled');
await write();checks++;
await db.exec("insert into storage.objects values(1,'asset')");checks++;
await db.exec('select public.legacy_admin_write()');checks++;
ok((await rpc('acquire')).allowed,true,'Idempotent same-session acquire');
ok((await rpc('renew')).lease_ms,600000,'Renew active lease');
await as(a,s2);
ok((await rpc('acquire')).reason,'busy','Second device cannot displace first');
ok((await rpc('release')).allowed,false,'Second cannot release first');
ok(await allowed(),{a:false,b:false},'Second gets no role');
await deny(write,'PT401');
await deny(()=>db.exec('select public.legacy_admin_write()'),'PT401');
await deny(()=>db.exec("insert into storage.objects values(2,'bad')"),'42501');
for(const t of ['admins','ergebnisse','pdf_layout_settings','saisons','verein_ergebnisse','verein_teilnehmer','vereine','zeitfenster'])
 await deny(()=>db.exec('delete from public.'+t+' where false'),'PT401');
await deny(()=>db.exec('select * from rtliga_admin_private.leases'),'42501');
await deny(()=>db.exec("update rtliga_admin_private.leases set expires_at='infinity'"),'42501');
await deny(()=>db.exec('select rtliga_admin_private.active()'),'42501');
await deny(()=>db.exec('select rtliga_admin_private.member()'),'42501');
await as(a,s1);ok(await allowed(),{a:true,b:true},'First remains active after rejection');await write();checks++;
await as(b,sb);ok((await rpc('acquire')).allowed,true,'Different admin independent');await write();checks++;
await as(clubUser,sc);ok((await rpc('acquire')).reason,'not_admin','Club cannot become admin');
ok((await db.query('select public.rtliga_club_session_v1($1,$2) r',['acquire',club])).rows[0].r.allowed,true,'Club lease unaffected');
await db.exec(`insert into public.verein_teilnehmer values(1,'${club}','club test')`);checks++;
await as(a,s1);ok((await rpc('release')).allowed,true,'Owner release');ok((await rpc('acquire')).allowed,false,'Released SID cannot revive');
await deny(write,'PT401');
await as(a,s2);ok((await rpc('acquire')).allowed,true,'Second can enter after release');
await maintenance();await db.query("update rtliga_admin_private.leases set expires_at=clock_timestamp()-interval '1 second' where user_id=$1",[a]);
await as(a,s2);ok((await rpc('renew')).allowed,false,'Expired renewal denied');ok((await rpc('acquire')).allowed,false,'Expired acquire denied');await deny(write,'PT401');
await as(a,s3);ok((await rpc('acquire')).allowed,true,'Fresh SID after expiry');
await maintenance();await db.query('delete from auth.sessions where id=$1',[s3]);
await as(a,s3);ok(await allowed(),{a:false,b:false},'Revoked JWT cannot retain admin');await deny(write,'PT401');
await as(a,s4);ok((await rpc('acquire')).allowed,true,'New SID after auth revocation');
await as(a,sb);ok((await rpc('acquire')).allowed,false,'Foreign session ID denied');
await as(a,'invalid');ok((await rpc('acquire')).allowed,false,'Malformed SID denied');
await as(a,null);ok((await rpc('acquire')).allowed,false,'Missing SID denied');
await as(null,null,'anon');await deny(()=>rpc('acquire'),'42501');
await maintenance();await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[s4]);
await as(a,s4);ok((await rpc('renew')).allowed,false,'Auth expiry enforced');
await as(b,sb);await deny(()=>rpc('bad'),'22023');
await maintenance();await db.query('delete from public.admins where user_id=$1',[b]);
await as(b,sb);ok(await allowed(),{a:false,b:false},'Removed admin loses role');ok((await rpc('renew')).allowed,false,'Removed admin cannot renew');
await maintenance();await db.exec("update public.zeitfenster set value='maintenance'");checks++;
// Repeat installation must not replace history/role snapshots.
const awaitInstall=await file('adminsperre_installieren.sql');
await deny(()=>db.exec(awaitInstall),'P0001');

async function finish(){
 await db.exec('rollback');
 await db.exec(await file('adminsperre_rueckweg_NUR_BEI_ABBRUCH.sql'));
 ok((await db.query("select prosrc from pg_proc where oid='public.is_admin()'::regprocedure")).rows[0].prosrc,originalAdmin,'Rollback exact role body');
 ok((await db.query("select count(*)::int n from pg_trigger where tgname='rtliga_session_guard'")).rows[0].n,3,'Rollback preserves club guards');
 ok((await db.query("select count(*)::int n from pg_trigger where tgname='rtliga_admin_session_guard'")).rows[0].n,0,'Rollback removes only admin guards');
 console.log(`${checks} admin SQL assertions passed (PGlite; sequential, not a real parallel-connection test).`);
  await db.close();
}
await finish();
