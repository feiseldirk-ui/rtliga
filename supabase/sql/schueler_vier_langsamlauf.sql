CREATE OR REPLACE FUNCTION public.admin_correct_result(p_id bigint, p_series integer[], p_reason text, p_expected jsonb)
 RETURNS verein_ergebnisse
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p.altersklasse='Schüler' then v_ll:=p_series[1]+p_series[2]+p_series[3]+p_series[4]; v_sl:=0; else v_ll:=p_series[1]+p_series[2]+p_series[3]; v_sl:=p_series[4]+p_series[5]+p_series[6]; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.save_verein_ergebnis(p_verein_id uuid, p_vorname text, p_nachname text, p_altersklasse text, p_wettkampf integer, p_s1 integer, p_s2 integer, p_s3 integer, p_s4 integer, p_s5 integer, p_s6 integer, p_ll integer, p_sl integer, p_gesamt integer, p_status text, p_ergebnis text, p_saison integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_verein_name text;
  v_teilnehmer_id bigint;
  v_altersklasse text;
  v_result_id bigint;
  v_ll integer;
  v_sl integer;
  v_gesamt integer;
  v_status text := left(trim(coalesce(p_status, '')), 60);
begin
  if p_wettkampf not between 1 and 9 or p_saison not between 2000 and 2100 then
    raise exception 'Ungültiger Wettkampf oder ungültige Saison.' using errcode = '22023';
  end if;

  if p_s1 not between 0 and 100 or p_s2 not between 0 and 100 or
     p_s3 not between 0 and 100 or p_s4 not between 0 and 100 or
     p_s5 not between 0 and 100 or p_s6 not between 0 and 100 then
    raise exception 'Serienwerte müssen zwischen 0 und 100 liegen.' using errcode = '22023';
  end if;

  select v.vereinsname
    into v_verein_name
  from public.vereine v
  where v.id = p_verein_id
    and (v.user_id = auth.uid() or public.is_admin())
  limit 1;

  if v_verein_name is null then
    raise exception 'Für dieses Konto kann kein Vereinsergebnis gespeichert werden.' using errcode = '42501';
  end if;

  select t.id, t.altersklasse
    into v_teilnehmer_id, v_altersklasse
  from public.verein_teilnehmer t
  where t.verein_id = p_verein_id
    and lower(trim(coalesce(t.vorname, ''))) = lower(trim(coalesce(p_vorname, '')))
    and lower(trim(coalesce(t.name, ''))) = lower(trim(coalesce(p_nachname, '')))
    and coalesce(t.altersklasse, '') = coalesce(p_altersklasse, '')
    and coalesce(t.saison, p_saison::text) = p_saison::text
  limit 1;

  if v_teilnehmer_id is null then
    raise exception 'Teilnehmer gehört nicht zum aktuellen Verein oder zur Saison.' using errcode = '23503';
  end if;

  if lower(trim(coalesce(v_altersklasse, ''))) in ('schüler', 'schueler', 'student')
     and (p_s5 <> 0 or p_s6 <> 0) then
    raise exception 'In der Schülerklasse sind nur vier Serien zulässig.' using errcode = '22023';
  end if;

  if not public.is_admin() and not exists (
    select 1
    from public.zeitfenster z
    where z.saison = p_saison::text
      and z.wettkampf = p_wettkampf
      and z.start_ts is not null
      and z.ende_ts is not null
      and clock_timestamp() between z.start_ts and z.ende_ts
  ) then
    raise exception 'Das Zeitfenster für diesen Wettkampf ist nicht geöffnet.' using errcode = '42501';
  end if;

  if lower(trim(coalesce(v_altersklasse,''))) in ('schüler','schueler','student') then
    v_ll := p_s1 + p_s2 + p_s3 + p_s4;
    v_sl := 0;
  else
    v_ll := p_s1 + p_s2 + p_s3;
    v_sl := p_s4 + p_s5 + p_s6;
  end if;
  v_gesamt := v_ll + v_sl;

  insert into public.verein_ergebnisse (
    verein, vorname, nachname, altersklasse, wettkampf,
    s1, s2, s3, s4, s5, s6, ll, sl, gesamt,
    status, ergebnis, saison, verein_id, teilnehmer_id
  ) values (
    v_verein_name, trim(p_vorname), trim(p_nachname), v_altersklasse, p_wettkampf,
    p_s1, p_s2, p_s3, p_s4, p_s5, p_s6, v_ll, v_sl, v_gesamt,
    v_status,
    format(
      'WK%s: S1=%s, S2=%s, S3=%s, LL=%s, S4=%s, S5=%s, S6=%s, SL=%s, Gesamt=%s, Status=%s',
      p_wettkampf, p_s1, p_s2, p_s3, v_ll, p_s4, p_s5, p_s6, v_sl, v_gesamt, v_status
    ),
    p_saison::text, p_verein_id, v_teilnehmer_id
  )
  on conflict (saison, teilnehmer_id, wettkampf)
  do update set
    verein = excluded.verein,
    vorname = excluded.vorname,
    nachname = excluded.nachname,
    altersklasse = excluded.altersklasse,
    s1 = excluded.s1,
    s2 = excluded.s2,
    s3 = excluded.s3,
    s4 = excluded.s4,
    s5 = excluded.s5,
    s6 = excluded.s6,
    ll = excluded.ll,
    sl = excluded.sl,
    gesamt = excluded.gesamt,
    status = excluded.status,
    ergebnis = excluded.ergebnis,
    verein_id = excluded.verein_id
  returning id into v_result_id;

  return v_result_id;
end;
$function$
;

alter table public.verein_ergebnisse add constraint schueler_four_slow_series check (lower(btrim(coalesce(altersklasse,''))) not in ('schüler','schueler','student') or (s1 is not null and s2 is not null and s3 is not null and s4 is not null and s1 between 0 and 100 and s2 between 0 and 100 and s3 between 0 and 100 and s4 between 0 and 100 and coalesce(s5,0)=0 and coalesce(s6,0)=0 and ll is not null and sl is not null and gesamt is not null and ll=s1+s2+s3+s4 and sl=0 and gesamt=ll));

create or replace function public.enforce_student_slow_series() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if lower(btrim(coalesce(new.altersklasse,''))) in ('schüler','schueler','student') then
  if new.s1 is null or new.s2 is null or new.s3 is null or new.s4 is null
   or new.s1 not between 0 and 100 or new.s2 not between 0 and 100
   or new.s3 not between 0 and 100 or new.s4 not between 0 and 100
   or coalesce(new.s5,0)<>0 or coalesce(new.s6,0)<>0 then
   raise exception 'Schüler: genau vier Langsamlaufserien von 0 bis 100; S5 und S6 müssen 0 sein. Vor einem Klassenwechsel zusätzliche Serien mit Begründung korrigieren.' using errcode='22023';
  end if;
  new.ll:=new.s1+new.s2+new.s3+new.s4; new.sl:=0; new.gesamt:=new.ll;
  new.ergebnis:=format('WK%s: S1=%s, S2=%s, S3=%s, S4=%s, LL=%s, S5=0, S6=0, SL=0, Gesamt=%s, Status=%s',new.wettkampf,new.s1,new.s2,new.s3,new.s4,new.ll,new.gesamt,coalesce(new.status,''));
 elsif tg_op='UPDATE' and lower(btrim(coalesce(old.altersklasse,''))) in ('schüler','schueler','student') and new.altersklasse is distinct from old.altersklasse then
  new.ll:=coalesce(new.s1,0)+coalesce(new.s2,0)+coalesce(new.s3,0);
  new.sl:=coalesce(new.s4,0)+coalesce(new.s5,0)+coalesce(new.s6,0);
  new.gesamt:=new.ll+new.sl;
  new.ergebnis:=format('WK%s: S1=%s, S2=%s, S3=%s, LL=%s, S4=%s, S5=%s, S6=%s, SL=%s, Gesamt=%s, Status=%s',new.wettkampf,new.s1,new.s2,new.s3,new.ll,new.s4,new.s5,new.s6,new.sl,new.gesamt,coalesce(new.status,''));
 end if;
 return new;
end $$;
revoke all on function public.enforce_student_slow_series() from public,anon,authenticated;
create trigger student_slow_series before insert or update on public.verein_ergebnisse for each row execute function public.enforce_student_slow_series();

