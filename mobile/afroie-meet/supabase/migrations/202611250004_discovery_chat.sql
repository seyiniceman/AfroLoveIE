create schema if not exists social;
revoke all on schema social from public,anon,authenticated;

create table social.passes(actor uuid references auth.users on delete cascade, peer uuid references auth.users on delete cascade, primary key(actor,peer));
create table social.blocks(like social.passes including all);
alter table social.blocks add foreign key(actor) references auth.users on delete cascade, add foreign key(peer) references auth.users on delete cascade;
create table social.plus(member uuid primary key references auth.users on delete cascade, expires timestamptz not null);
create table social.intros(
 id uuid primary key default gen_random_uuid(), sender uuid not null references auth.users on delete cascade,
 recipient uuid not null references auth.users on delete cascade, kind text not null, choice text not null, body text not null,
 status text not null default 'pending', created_at timestamptz not null default now(),
 unique(sender,recipient),check(sender<>recipient)
);
create index on social.intros(sender,created_at);
create table social.matches(id uuid primary key default gen_random_uuid(), a uuid not null references auth.users on delete cascade,
 b uuid not null references auth.users on delete cascade, active boolean not null default true, unique(a,b),check(a<b));
create table social.messages(id bigint generated always as identity primary key, thread uuid references social.matches on delete cascade,
 sender uuid not null references auth.users on delete cascade, body text, audio text unique, status text not null default 'sent',
 warning boolean not null default false, early boolean not null,created_at timestamptz not null default now(), check(num_nonnulls(body,audio)=1));
create index on social.messages(thread,id);
create table social.reports(id uuid primary key default gen_random_uuid(), reporter uuid references auth.users on delete set null,
 peer uuid references auth.users on delete set null,thread uuid,reason text not null,created_at timestamptz default now());

create function social.ready(u uuid) returns boolean language sql stable as $$
 select exists(select from public.member_drafts d join public.profiles p using(user_id) where d.user_id=u and d.published_at is not null and p.email_verified and p.phone_verified and p.selfie_verified and p.verification_status='approved')
$$;
create function social.blocked(u uuid,v uuid) returns boolean language sql stable as $$
 select exists(select from social.blocks where (actor=u and peer=v) or (peer=u and actor=v))
$$;
create function social.name(u uuid) returns text language sql stable as $$
 select sections->'1'->>'name' from public.member_drafts where user_id=u
$$;
create function social.used_today(u uuid) returns int language sql stable as $$
 select count(*)::int from social.intros where sender=u and created_at >= (date_trunc('day',now() at time zone 'Europe/Dublin') at time zone 'Europe/Dublin')
$$;
create function public.intro_balance() returns int language sql stable security definer set search_path='' as $$
 select case when exists(select from social.plus where member=auth.uid() and expires>now()) then -1 else greatest(0,5-social.used_today(auth.uid())) end
$$;
create function social.discoverable(u uuid,v uuid) returns boolean language sql stable as $$
 select u<>v and social.ready(u) and social.ready(v) and not social.blocked(u,v)
 and not exists(select from social.passes where actor=u and peer=v)
 and not exists(select from social.intros where sender=u and recipient=v or sender=v and recipient=u and status='pending')
 and not exists(select from social.matches where a=least(u,v) and b=greatest(u,v))
$$;

create function public.discover_action(peer uuid, action text, kind text default null, choice text default null, note text default null)
returns int language plpgsql security definer set search_path='' as $$
declare u uuid=auth.uid(); data jsonb; remaining int;
begin
 perform pg_advisory_xact_lock(hashtextextended(least(u,peer)::text||greatest(u,peer)::text,1));
 perform 1 from public.member_drafts where user_id=u for update;
 if not social.discoverable(u,peer) then raise exception 'This profile is unavailable.'; end if;
 if action='pass' then insert into social.passes values(u,peer) on conflict do nothing;
 elsif action='intro' then
  if length(trim(regexp_replace(coalesce(note,''),'[[:space:]]+',' ','g'))) not between 20 and 1000 then raise exception 'Write an introduction of 20–1,000 characters.'; end if;
  select sections into data from public.member_drafts where user_id=peer;
  if not coalesce((kind='photo' and data->'5'->'photos' ? choice) or
    (kind='prompt' and exists(select from jsonb_array_elements(data->'6'->'answers') a where a->>'prompt'=choice)),false)
    then raise exception 'Choose a photo or prompt from this profile.'; end if;
  remaining=public.intro_balance(); if remaining=0 then raise exception 'DAILY_LIMIT'; end if;
  insert into social.intros(sender,recipient,kind,choice,body) values(u,peer,kind,choice,trim(note));
 else raise exception 'Unknown discovery action.'; end if;
 return public.intro_balance();
end $$;

create function public.intro_inbox() returns table(id uuid,peer uuid,name text,kind text,choice text,body text)
language sql stable security definer set search_path='' as $$
 select i.id,i.sender,social.name(i.sender),i.kind,i.choice,i.body from social.intros i
 where i.recipient=auth.uid() and i.status='pending' and social.ready(auth.uid()) and social.ready(i.sender) and not social.blocked(i.sender,i.recipient)
 order by i.created_at desc
$$;
create function public.respond_intro(intro uuid,accept boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare i social.intros; mid uuid;
begin
 select * into strict i from social.intros where id=intro and recipient=auth.uid() for update;
 if not social.ready(auth.uid()) or not social.ready(i.sender) or social.blocked(i.sender,i.recipient) then raise exception 'Introduction unavailable.'; end if;
 if i.status='accepted' and accept then select id into mid from social.matches where a=least(i.sender,i.recipient) and b=greatest(i.sender,i.recipient) and active; return mid; end if;
 if i.status<>'pending' or accept is null then raise exception 'Introduction already handled.'; end if;
 update social.intros set status=case when accept then 'accepted' else 'declined' end where id=intro;
 if accept then insert into social.matches(a,b) values(least(i.sender,i.recipient),greatest(i.sender,i.recipient)) returning id into mid;
 else insert into social.passes values(i.recipient,i.sender) on conflict do nothing; end if;
 return mid;
end $$;
create function social.allowed(m social.matches,u uuid) returns boolean language sql stable as $$
 select m.active and u in(m.a,m.b) and social.ready(m.a) and social.ready(m.b) and not social.blocked(m.a,m.b)
$$;
create function public.my_threads() returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select m.id,social.name(case when m.a=auth.uid() then m.b else m.a end) from social.matches m where social.allowed(m,auth.uid()) order by 2,m.id
$$;
create function public.thread_action(thread_id uuid,action text,reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare m social.matches;peer uuid;
begin
 select * into m from social.matches where id=thread_id for update;
 if m.id is null or not social.allowed(m,auth.uid()) then raise exception 'Chat unavailable.'; end if;
 peer=case when m.a=auth.uid() then m.b else m.a end;
 if action='report' then
 if length(trim(coalesce(reason,''))) not between 3 and 1000 then raise exception 'Describe the issue in 3–1,000 characters.';end if;
 insert into social.reports(reporter,peer,thread,reason) values(auth.uid(),peer,m.id,trim(reason));
 elsif action in ('block','unmatch') then
 if action='block' then insert into social.blocks values(auth.uid(),peer) on conflict do nothing; end if;
 update social.matches set active=false where id=m.id;
 else raise exception 'Unknown action.'; end if;
end $$;

create function social.contact(t text) returns boolean language sql immutable as $$
 select t ~* '([[:alnum:]._%+-]+[[:space:]]*@[[:space:]]*[[:alnum:].-]+[.][[:alpha:]]{2,}|([+]?[[:digit:]][[:space:].()/-]*){7,}|instagram|instagr[.]am|ig[.]me|whatsapp|wa[.]me|@[[:alnum:]_.]{2,})'
$$;
create function social.risky(t text) returns boolean language sql immutable as $$
 select t ~* '(send[[:space:]]+money|crypto|gift[[:space:]-]*card)'
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('chat-voice','chat-voice',false,5242880,array['audio/webm','audio/mp4','audio/m4a','audio/x-m4a']);
create function public.chat_media_access(object_name text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m social.matches;owner text=split_part(object_name,'/',2);
begin
 select * into m from social.matches where id::text=split_part(object_name,'/',1);
 if m.id is null or not social.allowed(m,auth.uid()) then return false; end if;
 if owner=auth.uid()::text then return true; end if;
 return not writing and exists(select from social.messages where thread=m.id and audio=object_name and status='sent');
end $$;
create policy chat_audio_upload on storage.objects for insert to authenticated with check(bucket_id='chat-voice' and public.chat_media_access(name,true));
create policy chat_audio_read on storage.objects for select to authenticated using(bucket_id='chat-voice' and public.chat_media_access(name,false));
create function public.post_chat(thread_id uuid, content text, format text default 'text') returns void language plpgsql security definer set search_path='' as $$
declare m social.matches; early boolean;
begin
 select * into m from social.matches where id=thread_id for update;
 if m.id is null or not social.allowed(m,auth.uid()) then raise exception 'Chat unavailable.'; end if;
 select count(*)<10 into early from (select 1 from social.messages msg where msg.thread=m.id and status='sent' limit 10) limited;
 if format='text' then
 if length(trim(coalesce(content,''))) not between 1 and 2000 or content !~ '[^[:space:]]' then raise exception 'Write a message of 1–2,000 characters.';end if;
 if early and social.contact(content) then raise exception 'Keep contact details off the first ten messages.';end if;
 insert into social.messages(thread,sender,body,early,warning) values(m.id,auth.uid(),trim(content),early,social.risky(content));
 elsif format='voice' then
 if split_part(content,'/',2) is distinct from auth.uid()::text or split_part(content,'/',1) is distinct from m.id::text
 or not exists(select from storage.objects where bucket_id='chat-voice' and name=content) then raise exception 'Record a voice note for this conversation.';end if;
 insert into social.messages(thread,sender,audio,status,early) values(m.id,auth.uid(),content,'pending',early);
 else raise exception 'Send text or a voice note.';end if;
end $$;
create function public.review_chat_voice(message_id bigint,transcript text) returns void language plpgsql security definer set search_path='' as $$
declare msg social.messages; m social.matches;
begin
 select * into strict msg from social.messages where id=message_id and status='pending' for update;
 select * into m from social.matches where id=msg.thread for update;
 update social.messages set status=case when not social.allowed(m,msg.sender) or nullif(trim(transcript),'') is null or (msg.early and social.contact(transcript)) then 'rejected' else 'sent' end,
 warning=coalesce(social.risky(transcript),false) where id=msg.id;
end $$;
create function public.pending_voice_reviews() returns table(id bigint,path text) language sql stable security definer set search_path='' as $$
 select id,audio from social.messages where status='pending' order by id limit 50
$$;
create function public.chat_history(thread_id uuid,before_id bigint default null) returns table(id bigint,sender uuid,body text,audio text,status text,warning boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select from social.matches m where m.id=thread_id and social.allowed(m,auth.uid())) then raise exception 'Chat unavailable.'; end if;
 return query select q.* from (select msg.id,msg.sender,msg.body,msg.audio,msg.status,msg.warning from social.messages msg where msg.thread=thread_id
 and (msg.status='sent' or msg.sender=auth.uid()) and (before_id is null or msg.id<before_id) order by msg.id desc limit 100) q order by q.id;
end $$;
create or replace function public.member_cards() returns table(user_id uuid, card jsonb)
language sql stable security definer set search_path='' as $$
 select d.user_id, jsonb_build_object(
   'name',d.sections->'1'->>'name','age',extract(year from age(current_date,p.date_of_birth))::integer,
   'location',d.sections->'1'->>'location','gender',d.sections->'1'->>'gender','height',d.sections->'1'->>'height',
   'origin',d.sections->'2'->>'origin','languages',d.sections->'2'->>'languages','religion',d.sections->'2'->>'religion',
   'ethnicity',d.sections->'2'->>'ethnicity','intent',d.sections->'3'->>'intent','kids',d.sections->'4'->>'kids',
   'smoking',d.sections->'4'->>'smoking','drinking',d.sections->'4'->>'drinking','occupation',d.sections->'4'->>'occupation',
   'education',d.sections->'4'->>'education','photos',d.sections->'5'->'photos','answers',d.sections->'6'->'answers',
   'bio',d.sections->'7'->>'bio','voice',d.sections->'8'->>'voice')
 from public.member_drafts d join public.profiles p on p.user_id=d.user_id
 where d.published_at is not null and p.verification_status='approved' and p.email_verified and p.phone_verified
 and d.user_id<>auth.uid() and public.verified_home()
 and exists(select from public.member_drafts own where own.user_id=auth.uid() and own.published_at is not null)
 and social.discoverable(auth.uid(),d.user_id) order by d.published_at desc
$$;
create or replace function public.is_published_member_media(bucket text, object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.verified_home()
 and exists(select from public.member_drafts own where own.user_id=auth.uid() and own.published_at is not null)
 and exists(select from public.member_drafts d join public.profiles p on p.user_id=d.user_id
 where not social.blocked(auth.uid(),d.user_id) and d.published_at is not null and p.verification_status='approved' and p.email_verified and p.phone_verified
 and ((bucket='member-photos' and (d.sections->'5'->'photos') ? object_path) or (bucket='member-voice' and d.sections->'8'->>'voice'=object_path)))
$$;
revoke all on function public.is_published_member_media(text,text) from public,anon;
grant execute on function public.is_published_member_media(text,text) to authenticated;
do $$declare f regprocedure;begin
 foreach f in array array['public.intro_balance()','public.discover_action(uuid,text,text,text,text)','public.intro_inbox()','public.respond_intro(uuid,boolean)','public.my_threads()','public.thread_action(uuid,text,text)','public.post_chat(uuid,text,text)','public.chat_history(uuid,bigint)','public.chat_media_access(text,boolean)']::regprocedure[] loop
 execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);end loop;
 foreach f in array array['public.review_chat_voice(bigint,text)','public.pending_voice_reviews()']::regprocedure[] loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);end loop;
end $$;
