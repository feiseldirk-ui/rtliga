import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleClock, IDLE_LIMIT_MS, IDLE_WARNING_MS, isIdleActivity, formatIdleCountdown, logoutMatchingSession } from '../src/lib/idleSessionCore.js';

const start = 1800000000000;
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,String(value)), data };
};
function fixture(storage=memory(), identity='account:session') {
  let time = start;
  const clock = createIdleClock({identity,storage,now:()=>time});
  return {clock,storage,now:()=>time,advance:ms=>{time+=ms;}};
}
test('Fristen sind 15 Minuten und zwei Minuten Vorwarnung',()=>{
  assert.equal(IDLE_LIMIT_MS,900000); assert.equal(IDLE_WARNING_MS,120000);
});
test('Vor 13 Minuten aktiv, genau danach Warnung, genau nach 15 Minuten abgelaufen',()=>{
  const f=fixture(); f.advance(779999); assert.equal(f.clock.tick().phase,'active');
  f.advance(1); assert.equal(f.clock.tick().phase,'warning');
  f.advance(120000); assert.equal(f.clock.tick().phase,'expired');
});
test('Bedienung vor der Warnung startet Frist neu',()=>{
  const f=fixture(); f.advance(600000); f.clock.activity(); f.advance(600000);
  assert.equal(f.clock.tick().phase,'active');
});
test('Warnung wird nicht durch zufällige Mausbewegung quittiert',()=>{
  const f=fixture(); f.advance(780000); assert.equal(f.clock.activity().phase,'warning');
  f.advance(120000); assert.equal(f.clock.tick().phase,'expired');
});
test('Angemeldet bleiben verlängert vor dem Ablauf',()=>{
  const f=fixture(); f.advance(899999);
  assert.equal(f.clock.activity({explicit:true}).remainingMs,900000);
});
test('Angemeldet bleiben kann abgelaufene Sitzung nicht wiederbeleben',()=>{
  const f=fixture(); f.advance(900000);
  assert.equal(f.clock.activity({explicit:true}).phase,'expired');
});
test('Nach Schlafmodus wird abgelaufene Frist sofort erkannt',()=>{
  const f=fixture(); f.advance(3600000); assert.equal(f.clock.activity().phase,'expired');
});
test('Neuladen startet keine neuen 15 Minuten',()=>{
  const f=fixture(); f.advance(800000);
  const reload=createIdleClock({identity:'account:session',storage:f.storage,now:f.now});
  assert.equal(reload.tick().remainingMs,100000); assert.equal(reload.tick().phase,'warning');
});
test('Wiederöffnen nach Frist bleibt abgelaufen',()=>{
  const f=fixture(); f.advance(900001);
  const reopen=createIdleClock({identity:'account:session',storage:f.storage,now:f.now});
  assert.equal(reopen.tick().phase,'expired');
});
test('Aktivität in einem Tab gilt auch für dieselbe Sitzung in anderen Tabs',()=>{
  const f=fixture(); const other=createIdleClock({identity:'account:session',storage:f.storage,now:f.now});
  f.advance(700000); f.clock.activity(); f.advance(100000);
  assert.equal(other.tick().remainingMs,800000);
});
test('Beendigung bleibt trotz später Aktivitätsdaten anderer Tabs bestehen',()=>{
  const f=fixture(); f.clock.expire('switch');
  f.storage.setItem('rtliga-idle-v1:account:session:activity',start+1);
  assert.equal(f.clock.activity({explicit:true}).phase,'expired');
  const other=createIdleClock({identity:'account:session',storage:f.storage,now:f.now});
  assert.equal(other.tick().phase,'expired');
});
test('Neue Auth-Sitzung bekommt eigene Frist',()=>{
  const f=fixture(); f.clock.expire(); f.advance(1000000);
  const next=createIdleClock({identity:'account:new-session',storage:f.storage,now:f.now});
  assert.equal(next.tick().remainingMs,900000);
});
test('Defekte Speicherwerte geben keinen unbeschränkten Zugang',()=>{
  for(const value of ['NaN','infinity','-1','',String(start+10000000)]){
    const storage=memory(); storage.setItem('rtliga-idle-v1:a:activity',value);
    assert.equal(createIdleClock({identity:'a',storage,now:()=>start}).tick().phase,'expired');
  }
});
test('Gesperrter Browserspeicher führt zur Sperre statt Fristverlust',()=>{
  const clock=createIdleClock({identity:'a',storage:{getItem(){throw Error();},setItem(){throw Error();}},now:()=>start});
  assert.equal(clock.tick().phase,'expired'); assert.equal(clock.tick().storageFailed,true);
});
test('Nur echte Bedienereignisse bei sichtbarer Seite zählen',()=>{
  for(const type of ['pointerdown','pointermove','keydown','wheel','touchstart','input']){
    assert.equal(isIdleActivity({type,isTrusted:true}),true);
    assert.equal(isIdleActivity({type,isTrusted:false}),false);
    assert.equal(isIdleActivity({type,isTrusted:true},false),false);
  }
  for(const type of ['focus','visibilitychange','storage','timer','heartbeat','TOKEN_REFRESHED'])
    assert.equal(isIdleActivity({type,isTrusted:true}),false);
});
test('Countdown rundet auf verbleibende Sekunden und nie negativ',()=>{
  assert.equal(formatIdleCountdown(120000),'2:00'); assert.equal(formatIdleCountdown(119001),'2:00');
  assert.equal(formatIdleCountdown(119000),'1:59'); assert.equal(formatIdleCountdown(-1),'0:00');
});

function authFixture(){
  let current={identity:'a:one'}; const calls=[];
  const client={auth:{
    async getSession(){return {data:{session:current}};},
    async signOut(options){calls.push(options);current=null;return {};}
  }};
  const api={async request(action,club){calls.push([action,club]);}};
  return {client,api,calls,identify:s=>s?.identity||null,change:s=>{current=s;}};
}
test('Verein: erst Freigabe, dann ausschließlich lokale Abmeldung',async()=>{
  const f=authFixture();
  await logoutMatchingSession(f.client,f.api,{id:'club',identity:'a:one'},'a:one',f.identify);
  assert.deepEqual(f.calls,[['release','club'],{scope:'local'}]);
});
test('Admin: lokale Abmeldung ohne Vereinsfreigabe',async()=>{
  const f=authFixture();await logoutMatchingSession(f.client,f.api,null,'a:one',f.identify);
  assert.deepEqual(f.calls,[{scope:'local'}]);
});
test('Fremder gespeicherter Verein wird nicht freigegeben',async()=>{
  const f=authFixture();await logoutMatchingSession(f.client,f.api,{id:'club',identity:'b:two'},'a:one',f.identify);
  assert.deepEqual(f.calls,[{scope:'local'}]);
});
test('Fehler der Freigabe verhindert Versuch der Auth-Abmeldung nicht',async()=>{
  const f=authFixture();f.api.request=async()=>{throw Error('offline');};
  await logoutMatchingSession(f.client,f.api,{id:'club',identity:'a:one'},'a:one',f.identify);
  assert.deepEqual(f.calls,[{scope:'local'}]);
});
test('Auth-Abmeldefehler wird nicht als Erfolg gemeldet',async()=>{
  const f=authFixture();f.client.auth.signOut=async()=>({error:Error('offline')});
  await assert.rejects(logoutMatchingSession(f.client,f.api,null,'a:one',f.identify),/nicht bestätigt/);
});
test('Keine Löschung einer inzwischen gewechselten Anmeldung',async()=>{
  const f=authFixture();f.change({identity:'b:two'});
  assert.deepEqual(await logoutMatchingSession(f.client,f.api,null,'a:one',f.identify),{changed:true});
  assert.deepEqual(f.calls,[]);
});
test('Kontowechsel während Freigabe wird erneut geprüft',async()=>{
  const f=authFixture();f.api.request=async()=>f.change({identity:'b:two'});
  assert.deepEqual(await logoutMatchingSession(f.client,f.api,{id:'club',identity:'a:one'},'a:one',f.identify),{changed:true});
  assert.deepEqual(f.calls,[]);
});
test('Bereits abgemeldete Sitzung ist erfolgreich beendet',async()=>{
  const f=authFixture();f.change(null);
  assert.deepEqual(await logoutMatchingSession(f.client,f.api,null,'a:one',f.identify),{changed:false});
  assert.deepEqual(f.calls,[]);
});
test('Nicht entfernte Anmeldung trotz fehlerfreier SDK-Antwort wird erkannt',async()=>{
  const f=authFixture();f.client.auth.signOut=async()=>({});
  await assert.rejects(logoutMatchingSession(f.client,f.api,null,'a:one',f.identify),/weiterhin vorhanden/);
});
