begin;

alter table public.admin_audit_log drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log add constraint admin_audit_log_entity_type_check
  check (entity_type in ('teilnehmer','verein','ergebnis'));
alter table public.admin_audit_log
  add column if not exists saison text,
  add column if not exists wettkampf integer,
  add column if not exists participant_label text,
  add column if not exists club_label text;

-- Keep the original identity in each entry even after a later rename.
create or replace function rtliga_admin_private.audit_context()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.teilnehmer_id is not null then
    select coalesce(new.saison,t.saison),
           coalesce(new.participant_label,concat_ws(' ',t.vorname,t.name)),
           coalesce(new.club_label,v.vereinsname)
    into new.saison,new.participant_label,new.club_label
    from public.verein_teilnehmer t left join public.vereine v on v.id=t.verein_id
    where t.id=new.teilnehmer_id;
  elsif new.verein_id is not null then
    select coalesce(new.club_label,v.vereinsname) into new.club_label
    from public.vereine v where v.id=new.verein_id;
  end if;
  return new;
end $$;
revoke all on function rtliga_admin_private.audit_context() from public,anon,authenticated;
create trigger admin_audit_context before insert on public.admin_audit_log
for each row execute function rtliga_admin_private.audit_context();

-- Existing participant corrections remain compatible with the current UI.
create or replace function public.admin_update_teilnehmer_stammdaten(
 p_teilnehmer_id bigint,p_vorname text,p_nachname text,p_altersklasse text,p_bemerkung text
) returns public.verein_teilnehmer language plpgsql security definer set search_path='' as $$
declare
 o public.verein_teilnehmer%rowtype; n public.verein_teilnehmer%rowtype;
 reason text:=btrim(coalesce(p_bemerkung,'')); field text;
begin
 if auth.uid() is null or not public.is_admin() then
   raise exception 'Eine aktive Admin-Sitzung ist erforderlich.' using errcode='42501';
 end if;
 if char_length(reason) not between 5 and 2000 then
   raise exception 'Bitte einen nachvollziehbaren Änderungsgrund mit 5 bis 2000 Zeichen eintragen.' using errcode='22023';
 end if;
 if char_length(btrim(coalesce(p_vorname,''))) not between 1 and 100
 or char_length(btrim(coalesce(p_nachname,''))) not between 1 and 100
 or p_altersklasse is null or p_altersklasse not in ('Schüler','Jugend','Junioren','Damen','Herren','Altersklasse') then
   raise exception 'Bitte gültige Namen und eine gültige Altersklasse angeben.' using errcode='22023';
 end if;
 select * into o from public.verein_teilnehmer where id=p_teilnehmer_id for update;
 if not found then raise exception 'Teilnehmer wurde nicht gefunden.' using errcode='P0002'; end if;
 if p_altersklasse='Schüler' and exists(select 1 from public.verein_ergebnisse where teilnehmer_id=o.id and (coalesce(s5,0)<>0 or coalesce(s6,0)<>0)) then
   raise exception 'Vor dem Wechsel zur Schülerklasse müssen S5 und S6 aller Runden auf 0 korrigiert werden.' using errcode='22023';
 end if;
 update public.verein_teilnehmer set vorname=btrim(p_vorname),name=btrim(p_nachname),altersklasse=p_altersklasse
 where id=o.id returning * into n;
 update public.verein_ergebnisse set vorname=n.vorname,nachname=n.name,altersklasse=n.altersklasse where teilnehmer_id=o.id;
 foreach field in array array['vorname','name','altersklasse'] loop
   if to_jsonb(o)->field is distinct from to_jsonb(n)->field then
     insert into public.admin_audit_log(admin_user_id,admin_email,entity_type,entity_id,verein_id,teilnehmer_id,field_name,old_value,new_value,bemerkung,participant_label,saison)
     values(auth.uid(),auth.jwt()->>'email','teilnehmer',o.id::text,o.verein_id,o.id,
       case field when 'vorname' then 'Vorname' when 'name' then 'Nachname' else 'Altersklasse' end,
       to_jsonb(o)->>field,to_jsonb(n)->>field,reason,concat_ws(' ',o.vorname,o.name),o.saison);
   end if;
 end loop;
 return n;
end $$;

create function public.admin_correct_participant(
 p_id bigint,p_first_name text,p_last_name text,p_category text,p_reason text,p_expected jsonb
) returns public.verein_teilnehmer language plpgsql security definer set search_path='' as $$
declare o public.verein_teilnehmer%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Eine aktive Admin-Sitzung ist erforderlich.' using errcode='42501'; end if;
 select * into o from public.verein_teilnehmer where id=p_id for update;
 if not found then raise exception 'Teilnehmer wurde nicht gefunden.' using errcode='P0002'; end if;
 if p_expected is distinct from jsonb_build_object('vorname',o.vorname,'name',o.name,'altersklasse',o.altersklasse) then
   raise exception 'Der Teilnehmer wurde inzwischen geändert. Bitte neu laden und die Korrektur prüfen.' using errcode='40001';
 end if;
 return public.admin_update_teilnehmer_stammdaten(p_id,p_first_name,p_last_name,p_category,p_reason);
end $$;

create function public.admin_correct_result(p_id bigint,p_series integer[],p_reason text,p_expected jsonb)
returns public.verein_ergebnisse language plpgsql security definer set search_path='' as $$
declare
 o public.verein_ergebnisse%rowtype; n public.verein_ergebnisse%rowtype;
 p public.verein_teilnehmer%rowtype; participant bigint;
 reason text:=btrim(coalesce(p_reason,'')); v_ll integer; v_sl integer;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Eine aktive Admin-Sitzung ist erforderlich.' using errcode='42501'; end if;
 if char_length(reason) not between 5 and 2000 then
   raise exception 'Bitte einen nachvollziehbaren Änderungsgrund mit 5 bis 2000 Zeichen eintragen.' using errcode='22023';
 end if;
 if p_series is null or array_ndims(p_series)<>1 or array_lower(p_series,1)<>1 or cardinality(p_series)<>6
 or exists(select 1 from unnest(p_series) s where s is null or s not between 0 and 100) then
   raise exception 'Sechs vollständige Serienwerte zwischen 0 und 100 sind erforderlich.' using errcode='22023';
 end if;
 select teilnehmer_id into participant from public.verein_ergebnisse where id=p_id;
 select * into p from public.verein_teilnehmer where id=participant for update;
 select * into o from public.verein_ergebnisse where id=p_id for update;
 if not found then raise exception 'Ergebnis wurde nicht gefunden.' using errcode='P0002'; end if;
 if o.teilnehmer_id is distinct from p.id or o.verein_id is distinct from p.verein_id then raise exception 'Teilnehmerzuordnung ist ungültig.' using errcode='23503'; end if;
 if p_expected is distinct from jsonb_build_object('s1',o.s1,'s2',o.s2,'s3',o.s3,'s4',o.s4,'s5',o.s5,'s6',o.s6,'status',o.status,'vorname',o.vorname,'nachname',o.nachname,'altersklasse',o.altersklasse) then
   raise exception 'Das Ergebnis wurde inzwischen geändert. Bitte neu laden und die Korrektur prüfen.' using errcode='40001';
 end if;
 if p.altersklasse='Schüler' and (p_series[5]<>0 or p_series[6]<>0) then raise exception 'In der Schülerklasse sind nur vier Serien zulässig.' using errcode='22023'; end if;
 if p_series=array[coalesce(o.s1,0),coalesce(o.s2,0),coalesce(o.s3,0),coalesce(o.s4,0),coalesce(o.s5,0),coalesce(o.s6,0)] then
   raise exception 'Es wurde kein Serienwert geändert.' using errcode='22023';
 end if;
 v_ll:=p_series[1]+p_series[2]+p_series[3]; v_sl:=p_series[4]+p_series[5]+p_series[6];
 perform set_config('rtliga.admin_correction_reason',reason,true);
 update public.verein_ergebnisse set s1=p_series[1],s2=p_series[2],s3=p_series[3],s4=p_series[4],s5=p_series[5],s6=p_series[6],
 ll=v_ll,sl=v_sl,gesamt=v_ll+v_sl,
 ergebnis=format('WK%s: S1=%s, S2=%s, S3=%s, LL=%s, S4=%s, S5=%s, S6=%s, SL=%s, Gesamt=%s, Status=%s',o.wettkampf,p_series[1],p_series[2],p_series[3],v_ll,p_series[4],p_series[5],p_series[6],v_sl,v_ll+v_sl,coalesce(o.status,''))
 where id=o.id returning * into n;
 insert into public.admin_audit_log(admin_user_id,admin_email,entity_type,entity_id,verein_id,teilnehmer_id,field_name,old_value,new_value,bemerkung,saison,wettkampf,participant_label,club_label)
 values(auth.uid(),auth.jwt()->>'email','ergebnis',o.id::text,o.verein_id,o.teilnehmer_id,'Ergebnis',
 jsonb_build_object('S1',o.s1,'S2',o.s2,'S3',o.s3,'S4',o.s4,'S5',o.s5,'S6',o.s6,'LL',o.ll,'SL',o.sl,'Gesamt',o.gesamt)::text,
 jsonb_build_object('S1',n.s1,'S2',n.s2,'S3',n.s3,'S4',n.s4,'S5',n.s5,'S6',n.s6,'LL',n.ll,'SL',n.sl,'Gesamt',n.gesamt)::text,
 reason,o.saison,o.wettkampf,concat_ws(' ',o.vorname,o.nachname),o.verein);
 return n;
end $$;

create function rtliga_admin_private.require_result_reason()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.is_admin() and
   array[new.s1,new.s2,new.s3,new.s4,new.s5,new.s6] is distinct from array[old.s1,old.s2,old.s3,old.s4,old.s5,old.s6]
   and char_length(btrim(coalesce(current_setting('rtliga.admin_correction_reason',true),''))) not between 5 and 2000 then
   raise exception 'Admin-Korrekturen bitte mit Begründung im Bereich Korrekturen speichern.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function rtliga_admin_private.require_result_reason() from public,anon,authenticated;
create trigger require_admin_result_reason before update on public.verein_ergebnisse
for each row execute function rtliga_admin_private.require_result_reason();

create function public.list_admin_corrections(p_before_id bigint default null,p_limit integer default 100)
returns setof public.admin_audit_log language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Eine aktive Admin-Sitzung ist erforderlich.' using errcode='42501'; end if;
 return query select * from public.admin_audit_log l where p_before_id is null or l.id<p_before_id
 order by l.id desc limit greatest(1,least(coalesce(p_limit,100),200));
end $$;

-- Existing records can only be corrected through the audited admin functions.
revoke update on public.verein_teilnehmer from public,anon,authenticated;
revoke all on public.admin_audit_log from public,anon,authenticated;
revoke all on function public.admin_correct_participant(bigint,text,text,text,text,jsonb),
 public.admin_correct_result(bigint,integer[],text,jsonb),public.list_admin_corrections(bigint,integer),
 public.admin_update_teilnehmer_stammdaten(bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_correct_participant(bigint,text,text,text,text,jsonb),
 public.admin_correct_result(bigint,integer[],text,jsonb),public.list_admin_corrections(bigint,integer),
 public.admin_update_teilnehmer_stammdaten(bigint,text,text,text,text) to authenticated;

-- International corrections stay isolated by league_id.
create table public.mt_admin_corrections(
 id bigint generated always as identity primary key,
 league_id uuid not null references public.mt_leagues(id),
 created_at timestamptz not null default clock_timestamp(),
 admin_user_id uuid not null,admin_email text,
 entity_type text not null check(entity_type in ('participant','result')),
 entity_id bigint not null,season integer,round_number integer,
 participant_label text,club_label text,
 old_value jsonb not null,new_value jsonb not null,
 reason text not null check(char_length(btrim(reason)) between 5 and 2000)
);
alter table public.mt_admin_corrections enable row level security;
revoke all on public.mt_admin_corrections from public,anon,authenticated;
create index mt_admin_corrections_league_id_idx on public.mt_admin_corrections(league_id,id desc);

create function rtliga_mt_session_private.audit_correction()
returns trigger language plpgsql security definer set search_path='' as $$
declare reason text; ov jsonb; nv jsonb; label text; club text; rn integer; kind text;
begin
 if tg_table_name='mt_participants' then
   ov:=jsonb_build_object('first_name',old.first_name,'last_name',old.last_name,'category',old.category,'active',old.active);
   nv:=jsonb_build_object('first_name',new.first_name,'last_name',new.last_name,'category',new.category,'active',new.active);
   if ov=nv then return new; end if;
   if auth.uid() is not null and not rtliga_mt_private.has_role(old.league_id,'admin') then
     raise exception 'Only an administrator can correct names or categories.' using errcode='42501';
   end if;
   label:=concat_ws(' ',old.first_name,old.last_name); kind:='participant';
   if lower(new.category) in ('student','schüler','schueler') and exists(
     select 1 from public.mt_results where participant_id=old.id and (s5<>0 or s6<>0)
   ) then raise exception 'Correct S5 and S6 to zero before changing to Student class.' using errcode='22023'; end if;
 else
   ov:=jsonb_build_object('S1',old.s1,'S2',old.s2,'S3',old.s3,'S4',old.s4,'S5',old.s5,'S6',old.s6,'Total',old.total);
   nv:=jsonb_build_object('S1',new.s1,'S2',new.s2,'S3',new.s3,'S4',new.s4,'S5',new.s5,'S6',new.s6,'Total',new.total);
   if ov=nv then return new; end if;
   select concat_ws(' ',p.first_name,p.last_name) into label from public.mt_participants p where p.id=old.participant_id;
   select round_number into rn from public.mt_rounds where id=old.round_id; kind:='result';
 end if;
 if auth.uid() is not null and rtliga_mt_private.has_role(old.league_id,'admin') then
   if not rtliga_mt_session_private.active(old.league_id) then raise exception 'Active admin session required.' using errcode='42501'; end if;
   reason:=btrim(coalesce(current_setting('rtliga.mt_correction_reason',true),''));
   if char_length(reason) not between 5 and 2000 then raise exception 'Use Admin corrections and supply a reason.' using errcode='22023'; end if;
   select name into club from public.mt_clubs where id=old.club_id;
   insert into public.mt_admin_corrections(league_id,admin_user_id,admin_email,entity_type,entity_id,season,round_number,participant_label,club_label,old_value,new_value,reason)
   values(old.league_id,auth.uid(),auth.jwt()->>'email',kind,old.id,old.season,rn,label,club,ov,nv,reason);
 end if;
 return new;
end $$;
revoke all on function rtliga_mt_session_private.audit_correction() from public,anon,authenticated;
create trigger mt_audit_participant after update on public.mt_participants for each row execute function rtliga_mt_session_private.audit_correction();
create trigger mt_audit_result after update on public.mt_results for each row execute function rtliga_mt_session_private.audit_correction();

create function public.mt_admin_correct(p_kind text,p_id bigint,p_values jsonb,p_expected jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.mt_participants%rowtype;r public.mt_results%rowtype;
 league uuid; snapshot jsonb; vals integer[]; reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if p_kind='participant' then
   select * into p from public.mt_participants where id=p_id for update; league:=p.league_id;
   snapshot:=jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'category',p.category,'active',p.active);
 elsif p_kind='result' then
   select participant_id into p.id from public.mt_results where id=p_id;
   select * into p from public.mt_participants where id=p.id for update;
   select * into r from public.mt_results where id=p_id for update;league:=r.league_id;
   snapshot:=jsonb_build_object('s1',r.s1,'s2',r.s2,'s3',r.s3,'s4',r.s4,'s5',r.s5,'s6',r.s6,'category',p.category);
 else raise exception 'Invalid correction type.' using errcode='22023'; end if;
 if league is null or not rtliga_mt_private.has_role(league,'admin') or not rtliga_mt_session_private.active(league) then
   raise exception 'Active administrator permission required for this league.' using errcode='42501';
 end if;
 if p_expected is distinct from snapshot then raise exception 'Record changed. Reload and review the correction.' using errcode='40001'; end if;
 if char_length(reason) not between 5 and 2000 then raise exception 'Explain the correction in 5 to 2000 characters.' using errcode='22023'; end if;
 perform set_config('rtliga.mt_correction_reason',reason,true);
 if p_kind='participant' then
   if char_length(btrim(coalesce(p_values->>'first_name',''))) not between 1 and 100
      or char_length(btrim(coalesce(p_values->>'last_name',''))) not between 1 and 100
      or coalesce(p_values->>'category','') not in ('Student','Youth','Junior','Women','Men','Men Senior','Women Senior') then
     raise exception 'Valid names and category required.' using errcode='22023';
   end if;
   update public.mt_participants set first_name=btrim(p_values->>'first_name'),last_name=btrim(p_values->>'last_name'),category=p_values->>'category',active=coalesce((p_values->>'active')::boolean,p.active) where id=p_id returning * into p;
   return to_jsonb(p);
 else
   if p_values is null or jsonb_typeof(p_values->'series') is distinct from 'array' or jsonb_array_length(p_values->'series')<>6 then
     raise exception 'Six complete series required.' using errcode='22023';
   end if;
   if exists(select 1 from jsonb_array_elements(p_values->'series') v where jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]{1,3}$') then
     raise exception 'Series must be whole numbers from 0 to 100.' using errcode='22023';
   end if;
   select array_agg(v::text::integer order by ord) into vals from jsonb_array_elements(p_values->'series') with ordinality t(v,ord);
   if exists(select 1 from unnest(vals) s where s not between 0 and 100) then raise exception 'Series out of range.' using errcode='22023'; end if;
   if vals=array[r.s1,r.s2,r.s3,r.s4,r.s5,r.s6] then raise exception 'No series changed.' using errcode='22023'; end if;
   update public.mt_results set s1=vals[1],s2=vals[2],s3=vals[3],s4=vals[4],s5=vals[5],s6=vals[6],updated_at=clock_timestamp() where id=p_id returning * into r;
   return to_jsonb(r);
 end if;
end $$;

create function public.mt_list_admin_corrections(p_league_id uuid,p_before_id bigint default null,p_limit integer default 100)
returns setof public.mt_admin_corrections language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not rtliga_mt_private.has_role(p_league_id,'admin') or not rtliga_mt_session_private.active(p_league_id) then
   raise exception 'Active admin permission required.' using errcode='42501';
 end if;
 return query select * from public.mt_admin_corrections where league_id=p_league_id and (p_before_id is null or id<p_before_id)
 order by id desc limit greatest(1,least(coalesce(p_limit,100),200));
end $$;
revoke all on function public.mt_admin_correct(text,bigint,jsonb,jsonb,text),public.mt_list_admin_corrections(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.mt_admin_correct(text,bigint,jsonb,jsonb,text),public.mt_list_admin_corrections(uuid,bigint,integer) to authenticated;

notify pgrst,'reload schema';
commit;
