import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSessionApi, createAdminLogin, adminSessionMessage } from '../src/lib/adminSessionCore.js';
import { sessionIdentity, createClubSessionMonitor } from '../src/lib/clubSessionCore.js';
import { logoutMatchingSession } from '../src/lib/idleSessionCore.js';

const session=(user='a',sid='one')=>({user:{id:user,email:user+'@example.test'},access_token:'x.'+Buffer.from(JSON.stringify({sub:user,session_id:sid})).toString('base64url')+'.x'});
function fixture(existing=null){
 let current=existing;const calls=[];
 const client={auth:{
  getSession:async()=>({data:{session:current}}),
  getUser:async()=>({data:{user:current?.user}}),
  signInWithPassword:async()=>{calls.push('login');current=session();return {data:{session:current}};},
  signOut:async o=>{calls.push(o);current=null;return {};},
 }};
 const api={request:async action=>{calls.push(action);return {allowed:true};}};
 return {client,api,calls,change:value=>{current=value;}};
}
test('Admin login acquires server lease before returning',async()=>{
 const f=fixture();const result=await createAdminLogin(f.client,f.api)('a@example.test','secret');
 assert.equal(result.identity,'a:one');assert.deepEqual(f.calls,['login','acquire']);
});
test('Rejected second device signs out only newly created local session',async()=>{
 const f=fixture();f.api.request=async()=>{throw Object.assign(Error('busy'),{reason:'busy'});};
 await assert.rejects(createAdminLogin(f.client,f.api)('a@example.test','secret'),/busy/);
 assert.deepEqual(f.calls,['login',{scope:'local'}]);
});
test('Existing same-browser identity is not replaced by password login',async()=>{
 const f=fixture(session());await createAdminLogin(f.client,f.api)('a@example.test','unused');
 assert.deepEqual(f.calls,['acquire']);
});
test('Existing rejected identity is never signed out automatically',async()=>{
 const f=fixture(session());f.api.request=async()=>{throw Error('ended');};
 await assert.rejects(createAdminLogin(f.client,f.api)('a@example.test','unused'));
 assert.deepEqual(f.calls,[]);
});
test('Different browser account cannot be silently replaced',async()=>{
 const f=fixture(session('other'));
 await assert.rejects(createAdminLogin(f.client,f.api)('a@example.test','secret'),e=>e.reason==='different_account');
 assert.deepEqual(f.calls,[]);
});
test('Concurrent submit is single-flight',async()=>{
 const f=fixture();const login=createAdminLogin(f.client,f.api);
 await Promise.all([login('a@example.test','secret'),login('a@example.test','secret')]);
 assert.deepEqual(f.calls,['login','acquire']);
});
test('Auth switch during acquire is not signed out',async()=>{
 const f=fixture();f.api.request=async()=>{f.change(session('other'));};
 await assert.rejects(createAdminLogin(f.client,f.api)('a@example.test','secret'),e=>e.reason==='account_changed');
 assert.deepEqual(f.calls,['login']);
});
test('Auto/manual logout releases admin before local signout',async()=>{
 const f=fixture(session());await logoutMatchingSession(f.client,null,null,'a:one',sessionIdentity,{adminApi:f.api,adminIdentity:'a:one'});
 assert.deepEqual(f.calls,['release',{scope:'local'}]);
});
test('Failed admin release still attempts local auth revocation',async()=>{
 const f=fixture(session());f.api.request=async()=>{throw Error('offline');};
 await logoutMatchingSession(f.client,null,null,'a:one',sessionIdentity,{adminApi:f.api,adminIdentity:'a:one'});
 assert.deepEqual(f.calls,[{scope:'local'}]);
});
test('Different admin marker does not release a lease',async()=>{
 const f=fixture(session());await logoutMatchingSession(f.client,null,null,'a:one',sessionIdentity,{adminApi:f.api,adminIdentity:'other:two'});
 assert.deepEqual(f.calls,[{scope:'local'}]);
});
test('Account changing during admin release is preserved',async()=>{
 const f=fixture(session());f.api.request=async()=>f.change(session('other'));
 assert.deepEqual(await logoutMatchingSession(f.client,null,null,'a:one',sessionIdentity,{adminApi:f.api,adminIdentity:'a:one'}),{changed:true});
 assert.deepEqual(f.calls,[]);
});
const clientFor=(data,error)=>({rpc:(name,args)=>{
 assert.equal(name,'rtliga_admin_session_v1');assert.deepEqual(args,{p_action:'renew'});
 return {abortSignal:async()=>({data,error})};
}});
test('RPC requires strict version/action/lease contract',async()=>{
 const valid={api_version:1,action:'renew',allowed:true,lease_ms:600000};
 assert.equal((await createAdminSessionApi(clientFor(valid)).request('renew')).lease_ms,600000);
 for(const patch of [{api_version:2},{action:'acquire'},{allowed:'true'},{lease_ms:0},{lease_ms:600001}])
  await assert.rejects(createAdminSessionApi(clientFor({...valid,...patch})).request('renew'),e=>e.reason==='unavailable');
});
test('RPC exposes busy and missing installation separately',async()=>{
 await assert.rejects(createAdminSessionApi(clientFor({api_version:1,action:'renew',allowed:false,reason:'busy'})).request('renew'),e=>e.reason==='busy');
 await assert.rejects(createAdminSessionApi(clientFor(null,{code:'PGRST202'})).request('renew'),e=>e.reason==='unavailable');
});
test('Admin tab lock is distinct from club locks and never acquires on resume',async()=>{
 let key;let release;
 const checks=[];const api={request:async a=>{checks.push(a);return {lease_ms:600000};}};
 const locks={request:async(name,_options,fn)=>{key=name;await fn({});}};
 const active=new Promise(resolve=>{release=resolve;});
 const monitor=createClubSessionMonitor({api,clubId:'a',lockName:'rtliga-admin-editor:a',locks,onChange:s=>{if(s.phase==='active')release();}});
 try {monitor.start();await active;assert.equal(key,'rtliga-admin-editor:a');assert.deepEqual(checks,['renew']);}
 finally {monitor.stop();}
});
test('Blocked second tab never renews or releases first tab',async()=>{
 const calls=[];let next;
 const ready=new Promise(r=>{next=r;});
 const monitor=createClubSessionMonitor({api:{request:async a=>calls.push(a)},clubId:'a',lockName:'rtliga-admin-editor:a',locks:{request:async(_n,_o,fn)=>fn(null)},onChange:s=>next(s)});
 try {monitor.start();assert.equal((await ready).reason,'tab_busy');assert.deepEqual(calls,[]);}
 finally {monitor.stop();}
});
test('UI busy message promises first-session protection',()=>{
 assert.match(adminSessionMessage('busy'),/erste Sitzung bleibt aktiv/);
});
