-- Step 5: Pilot readiness — Settings, Safety, GDPR, Admin, Premium (Boost/Read Receipts), Legal, Push Notifications

alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text;

create table if not exists public.member_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hidden boolean not null default false,
  paused boolean not null default false,
  notifications_enabled boolean not null default true,
  push_token text,
  push_platform text,
  legal_accepted_at timestamptz,
  age_confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.member_settings enable row level security;
revoke all on public.member_settings from public, anon, authenticated;
grant select on public.member_settings to authenticated;
create policy own_settings on public.member_settings for select to authenticated using (user_id = auth.uid());

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

create table if not exists social.boosts (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);
create index if not exists boosts_member_started_idx on social.boosts(member, started_at desc);

alter table social.messages
  add column if not exists read_at timestamptz;

alter table social.reports
  add column if not exists status text not null default 'open'
    check (status in ('open','resolved','dismissed','banned')),
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.notification_events (
  id bigint generated always as identity primary key,
  recipient uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('new_intro','new_match','new_message','verification_approved')),
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_events_recipient_idx on public.notification_events(recipient, id desc);
create index if not exists notification_events_unsent_idx on public.notification_events(id) where sent_at is null;
alter table public.notification_events enable row level security;
revoke all on public.notification_events from public, anon, authenticated;
grant select on public.notification_events to authenticated;
create policy own_notifications on public.notification_events for select to authenticated using (recipient = auth.uid());

-- Helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid())
$$;

create or replace function public.verified_home() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(
    select 1 from public.profiles
    where user_id = auth.uid()
      and email_verified and phone_verified and selfie_verified
      and verification_status = 'approved'
      and banned_at is null
      and date_of_birth <= (current_date - interval '18 years')::date
  )
$$;

create or replace function public.account_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
      'banned', p.banned_at is not null,
      'banned_reason', p.banned_reason,
      'is_admin', public.is_admin()
    ) from public.profiles p where p.user_id = auth.uid()),
    jsonb_build_object('banned', false, 'banned_reason', null, 'is_admin', public.is_admin())
  )
$$;

create or replace function social.plus_active(u uuid) returns boolean
language sql stable as $$
  select exists(select 1 from social.plus where member = u and expires > now())
$$;

create or replace function social.ready(u uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from public.member_drafts d
    join public.profiles p using(user_id)
    where d.user_id = u
      and d.published_at is not null
      and p.email_verified and p.phone_verified and p.selfie_verified
      and p.verification_status = 'approved'
      and p.banned_at is null
  )
$$;

create or replace function social.discoverable(u uuid, v uuid) returns boolean
language sql stable as $$
  select u <> v
    and social.ready(u) and social.ready(v)
    and not social.blocked(u, v)
    and not exists(select 1 from public.member_settings s where s.user_id = v and (s.hidden or s.paused))
    and not exists(select 1 from public.member_settings s where s.user_id = u and s.paused)
    and not exists(select 1 from social.passes where actor = u and peer = v)
    and not exists(select 1 from social.intros where (sender = u and recipient = v) or (sender = v and recipient = u and status = 'pending'))
    and not exists(select 1 from social.matches where a = least(u, v) and b = greatest(u, v))
$$;

create or replace function social.enqueue_notification(target uuid, kind text, title text, body text, payload jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target is null then return; end if;
  if coalesce((select notifications_enabled from public.member_settings where user_id = target), true) then
    insert into public.notification_events(recipient, kind, title, body, data)
    values (target, kind, title, body, coalesce(payload, '{}'));
  end if;
end $$;

-- Admin selfie storage read policy
create policy admin_read_selfies on storage.objects for select to authenticated
using (bucket_id = 'verification-selfies' and public.is_admin());

-- Settings, legal & push token RPCs
create or replace function public.get_my_settings() returns public.member_settings
language plpgsql security definer set search_path = '' as $$
declare row public.member_settings;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  insert into public.member_settings(user_id) values (auth.uid()) on conflict do nothing;
  select * into row from public.member_settings where user_id = auth.uid();
  return row;
end $$;

create or replace function public.update_my_settings(
  p_hidden boolean default null,
  p_paused boolean default null,
  p_notifications boolean default null
) returns public.member_settings
language plpgsql security definer set search_path = '' as $$
declare row public.member_settings;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  insert into public.member_settings(user_id) values (auth.uid()) on conflict do nothing;
  update public.member_settings set
    hidden = coalesce(p_hidden, hidden),
    paused = coalesce(p_paused, paused),
    notifications_enabled = coalesce(p_notifications, notifications_enabled),
    updated_at = now()
  where user_id = auth.uid()
  returning * into row;
  return row;
end $$;

create or replace function public.record_legal_acceptance() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  insert into public.member_settings(user_id, legal_accepted_at, age_confirmed, updated_at)
  values (auth.uid(), now(), true, now())
  on conflict (user_id) do update set
    legal_accepted_at = coalesce(public.member_settings.legal_accepted_at, now()),
    age_confirmed = true,
    updated_at = now();
end $$;

create or replace function public.register_push_token(token text, platform text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  insert into public.member_settings(user_id, push_token, push_platform, updated_at)
  values (auth.uid(), nullif(trim(coalesce(token, '')), ''), nullif(trim(coalesce(platform, '')), ''), now())
  on conflict (user_id) do update set
    push_token = nullif(trim(coalesce(token, '')), ''),
    push_platform = coalesce(nullif(trim(coalesce(platform, '')), ''), public.member_settings.push_platform),
    updated_at = now();
end $$;

-- Blocked users management
create or replace function public.my_blocked_users() returns table(peer uuid, name text)
language sql stable security definer set search_path = '' as $$
  select b.peer, coalesce(social.name(b.peer), 'AfroIE Member')
  from social.blocks b
  where b.actor = auth.uid()
  order by 2, b.peer
$$;

create or replace function public.unblock_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  delete from social.blocks where actor = auth.uid() and peer = target;
end $$;

-- Premium entitlements & Boost
create or replace function public.my_entitlements() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  exp timestamptz;
  last_boost timestamptz;
  active_boost timestamptz;
begin
  if u is null then raise exception 'Not authenticated.'; end if;
  select expires into exp from social.plus where member = u and expires > now();
  select max(started_at) into last_boost from social.boosts where member = u;
  select max(expires_at) into active_boost from social.boosts where member = u and expires_at > now();
  return jsonb_build_object(
    'is_premium', exp is not null,
    'expires', exp,
    'can_boost', exp is not null and (last_boost is null or last_boost <= now() - interval '7 days'),
    'next_boost_at', case when last_boost is not null and last_boost > now() - interval '7 days' then last_boost + interval '7 days' else null end,
    'boosted_until', active_boost,
    'is_admin', public.is_admin()
  );
end $$;

create or replace function public.activate_boost() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  exp timestamptz;
begin
  if not social.ready(u) then raise exception 'Complete and publish your profile first.'; end if;
  if not social.plus_active(u) then raise exception 'Upgrade to Premium to use weekly Boost.'; end if;
  perform 1 from public.member_drafts where user_id = u for update;
  if exists(select 1 from social.boosts where member = u and started_at > now() - interval '7 days') then
    raise exception 'You can boost your profile once every 7 days.';
  end if;
  insert into social.boosts(member, started_at, expires_at)
  values (u, now(), now() + interval '30 minutes')
  returning expires_at into exp;
  return exp;
end $$;

create or replace function public.set_plus_entitlement(target_user uuid, active boolean, expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if active then
    insert into social.plus(member, expires)
    values (target_user, coalesce(expires_at, now() + interval '31 days'))
    on conflict (member) do update set expires = excluded.expires;
  else
    delete from social.plus where member = target_user;
  end if;
end $$;

-- Updated member_cards (orders active boosts first, respects hidden/paused/banned via social.discoverable)
create or replace function public.member_cards() returns table(user_id uuid, card jsonb)
language sql stable security definer set search_path = '' as $$
  select d.user_id, jsonb_build_object(
    'name', d.sections->'1'->>'name',
    'age', extract(year from age(current_date, p.date_of_birth))::integer,
    'location', d.sections->'1'->>'location',
    'gender', d.sections->'1'->>'gender',
    'height', d.sections->'1'->>'height',
    'origin', d.sections->'2'->>'origin',
    'languages', d.sections->'2'->>'languages',
    'religion', d.sections->'2'->>'religion',
    'ethnicity', d.sections->'2'->>'ethnicity',
    'intent', d.sections->'3'->>'intent',
    'kids', d.sections->'4'->>'kids',
    'smoking', d.sections->'4'->>'smoking',
    'drinking', d.sections->'4'->>'drinking',
    'occupation', d.sections->'4'->>'occupation',
    'education', d.sections->'4'->>'education',
    'photos', d.sections->'5'->'photos',
    'answers', d.sections->'6'->'answers',
    'bio', d.sections->'7'->>'bio',
    'voice', d.sections->'8'->>'voice',
    'boosted', exists(select 1 from social.boosts b where b.member = d.user_id and b.expires_at > now())
  )
  from public.member_drafts d
  join public.profiles p on p.user_id = d.user_id
  where d.published_at is not null
    and p.verification_status = 'approved'
    and p.email_verified and p.phone_verified and p.banned_at is null
    and d.user_id <> auth.uid()
    and public.verified_home()
    and exists(select 1 from public.member_drafts own where own.user_id = auth.uid() and own.published_at is not null)
    and social.discoverable(auth.uid(), d.user_id)
  order by exists(select 1 from social.boosts b where b.member = d.user_id and b.expires_at > now()) desc, d.published_at desc
$$;

-- Updated discover_action (enqueues new_intro notification)
create or replace function public.discover_action(peer uuid, action text, kind text default null, choice text default null, note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare u uuid = auth.uid(); data jsonb; remaining int; sender_name text;
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
    sender_name := coalesce(social.name(u), 'Someone');
    perform social.enqueue_notification(peer, 'new_intro', 'New introduction', sender_name || ' sent you an introduction.', jsonb_build_object('peer', u));
  else raise exception 'Unknown discovery action.'; end if;
  return public.intro_balance();
end $$;

-- Updated respond_intro (enqueues new_match notification)
create or replace function public.respond_intro(intro uuid, accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i social.intros; mid uuid; acceptor_name text;
begin
  select * into strict i from social.intros where id=intro and recipient=auth.uid() for update;
  if not social.ready(auth.uid()) or not social.ready(i.sender) or social.blocked(i.sender,i.recipient) then raise exception 'Introduction unavailable.'; end if;
  if i.status='accepted' and accept then select id into mid from social.matches where a=least(i.sender,i.recipient) and b=greatest(i.sender,i.recipient) and active; return mid; end if;
  if i.status<>'pending' or accept is null then raise exception 'Introduction already handled.'; end if;
  update social.intros set status=case when accept then 'accepted' else 'declined' end where id=intro;
  if accept then
    insert into social.matches(a,b) values(least(i.sender,i.recipient),greatest(i.sender,i.recipient)) returning id into mid;
    acceptor_name := coalesce(social.name(i.recipient), 'Your match');
    perform social.enqueue_notification(i.sender, 'new_match', 'It''s a match!', acceptor_name || ' accepted your introduction.', jsonb_build_object('thread_id', mid));
  else
    insert into social.passes values(i.recipient,i.sender) on conflict do nothing;
  end if;
  return mid;
end $$;

-- Updated post_chat (enqueues new_message notification for text)
create or replace function public.post_chat(thread_id uuid, content text, format text default 'text') returns void
language plpgsql security definer set search_path = '' as $$
declare m social.matches; early boolean; recipient_id uuid; sender_name text;
begin
  select * into m from social.matches where id=thread_id for update;
  if m.id is null or not social.allowed(m,auth.uid()) then raise exception 'Chat unavailable.'; end if;
  recipient_id := case when m.a = auth.uid() then m.b else m.a end;
  select count(*)<10 into early from (select 1 from social.messages msg where msg.thread=m.id and status='sent' limit 10) limited;
  if format='text' then
    if length(trim(coalesce(content,''))) not between 1 and 2000 or content !~ '[^[:space:]]' then raise exception 'Write a message of 1–2,000 characters.';end if;
    if early and social.contact(content) then raise exception 'Keep contact details off the first ten messages.';end if;
    insert into social.messages(thread,sender,body,early,warning) values(m.id,auth.uid(),trim(content),early,social.risky(content));
    sender_name := coalesce(social.name(auth.uid()), 'New message');
    perform social.enqueue_notification(recipient_id, 'new_message', sender_name, left(trim(content), 120), jsonb_build_object('thread_id', m.id));
  elsif format='voice' then
    if split_part(content,'/',2) is distinct from auth.uid()::text or split_part(content,'/',1) is distinct from m.id::text
    or not exists(select from storage.objects where bucket_id='chat-voice' and name=content) then raise exception 'Record a voice note for this conversation.';end if;
    insert into social.messages(thread,sender,audio,status,early) values(m.id,auth.uid(),content,'pending',early);
  else raise exception 'Send text or a voice note.';end if;
end $$;

-- Updated review_chat_voice (enqueues new_message notification when released as sent)
create or replace function public.review_chat_voice(message_id bigint, transcript text) returns void
language plpgsql security definer set search_path = '' as $$
declare msg social.messages; m social.matches; next_status text; recipient_id uuid; sender_name text;
begin
  select * into strict msg from social.messages where id=message_id and status='pending' for update;
  select * into m from social.matches where id=msg.thread for update;
  next_status := case when not social.allowed(m,msg.sender) or nullif(trim(transcript),'') is null or (msg.early and social.contact(transcript)) then 'rejected' else 'sent' end;
  update social.messages set status=next_status, warning=coalesce(social.risky(transcript),false) where id=msg.id;
  if next_status = 'sent' then
    recipient_id := case when m.a = msg.sender then m.b else m.a end;
    sender_name := coalesce(social.name(msg.sender), 'New message');
    perform social.enqueue_notification(recipient_id, 'new_message', sender_name, 'Sent you a voice note.', jsonb_build_object('thread_id', m.id));
  end if;
end $$;

-- Updated review_selfie (enqueues verification_approved notification)
create or replace function public.review_selfie(object_path text, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  update public.profiles
  set verification_status = case when approve then 'approved' else 'rejected' end,
      selfie_verified = approve
  where selfie_path = object_path and verification_status = 'pending'
  returning user_id into target_user;
  if not found then raise exception 'Pending submission not found.'; end if;
  if approve then
    perform social.enqueue_notification(target_user, 'verification_approved', 'Verification approved', 'Your selfie was approved. Welcome to AfroIE Meet!', '{}');
  end if;
end $$;

-- Read receipts
create or replace function public.mark_thread_read(thread_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m social.matches;
begin
  select * into m from social.matches where id = thread_id;
  if m.id is null or not social.allowed(m, auth.uid()) then raise exception 'Chat unavailable.'; end if;
  update social.messages
  set read_at = now()
  where thread = thread_id and sender <> auth.uid() and status = 'sent' and read_at is null;
end $$;

drop function if exists public.chat_history(uuid, bigint);
create function public.chat_history(thread_id uuid, before_id bigint default null)
returns table(id bigint, sender uuid, body text, audio text, status text, warning boolean, read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare show_receipts boolean := social.plus_active(auth.uid());
begin
  if not exists(select 1 from social.matches m where m.id = thread_id and social.allowed(m, auth.uid())) then
    raise exception 'Chat unavailable.';
  end if;
  return query
  select q.* from (
    select
      msg.id,
      msg.sender,
      msg.body,
      msg.audio,
      msg.status,
      msg.warning,
      case when show_receipts and msg.sender = auth.uid() then msg.read_at else null end as read_at
    from social.messages msg
    where msg.thread = thread_id
      and (msg.status = 'sent' or msg.sender = auth.uid())
      and (before_id is null or msg.id < before_id)
    order by msg.id desc
    limit 100
  ) q order by q.id;
end $$;

-- Admin dashboard & moderation actions
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return jsonb_build_object(
    'pending_selfies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'email', u.email,
        'name', coalesce(social.name(p.user_id), split_part(coalesce(u.email,''), '@', 1)),
        'date_of_birth', p.date_of_birth,
        'selfie_path', p.selfie_path,
        'banned', p.banned_at is not null
      ) order by u.created_at desc)
      from public.profiles p
      join auth.users u on u.id = p.user_id
      where p.verification_status = 'pending' and p.selfie_path is not null
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reporter_id', r.reporter,
        'reporter_name', coalesce(social.name(r.reporter), 'Former member'),
        'peer_id', r.peer,
        'peer_name', coalesce(social.name(r.peer), 'Former member'),
        'peer_banned', coalesce((select banned_at is not null from public.profiles p where p.user_id = r.peer), false),
        'thread_id', r.thread,
        'reason', r.reason,
        'status', r.status,
        'created_at', r.created_at
      ) order by case when r.status = 'open' then 0 else 1 end, r.created_at desc)
      from social.reports r
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_review_selfie(target_user uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  update public.profiles
  set verification_status = case when approve then 'approved' else 'rejected' end,
      selfie_verified = approve
  where user_id = target_user and verification_status = 'pending';
  if not found then raise exception 'Pending selfie submission not found.'; end if;
  if approve then
    perform social.enqueue_notification(target_user, 'verification_approved', 'Verification approved', 'Your selfie was approved. Welcome to AfroIE Meet!', '{}');
  end if;
end $$;

create or replace function public.admin_ban_user(target_user uuid, reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if target_user = auth.uid() then raise exception 'You cannot ban your own admin account.'; end if;
  update public.profiles
  set banned_at = now(),
      banned_reason = coalesce(nullif(trim(coalesce(reason, '')), ''), 'Community Guidelines violation'),
      verification_status = case when verification_status = 'pending' then 'rejected' else verification_status end,
      selfie_verified = case when verification_status = 'pending' then false else selfie_verified end
  where user_id = target_user;
  if not found then raise exception 'Member not found.'; end if;
  update social.matches set active = false where a = target_user or b = target_user;
  update social.reports set status = 'banned', reviewed_by = auth.uid(), reviewed_at = now()
  where peer = target_user and status = 'open';
end $$;

create or replace function public.admin_resolve_report(report_id uuid, decision text, ban_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r social.reports;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if decision not in ('resolved','dismissed','banned') then raise exception 'Invalid moderation decision.'; end if;
  select * into strict r from social.reports where id = report_id for update;
  if decision = 'banned' then
    if r.peer is not null then
      perform public.admin_ban_user(r.peer, coalesce(nullif(trim(coalesce(ban_reason, '')), ''), r.reason));
    end if;
    update social.reports set status = 'banned', reviewed_by = auth.uid(), reviewed_at = now() where id = report_id;
  else
    update social.reports set status = decision, reviewed_by = auth.uid(), reviewed_at = now() where id = report_id;
  end if;
end $$;

-- GDPR Data Export & Complete Account Deletion
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated.'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', id, 'email', email, 'phone', phone, 'created_at', created_at) from auth.users where id = u),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = u),
    'member_draft', (select to_jsonb(d) from public.member_drafts d where d.user_id = u),
    'settings', (select to_jsonb(s) from public.member_settings s where s.user_id = u),
    'cover_reviews', coalesce((select jsonb_agg(to_jsonb(c)) from public.cover_reviews c where c.user_id = u), '[]'::jsonb),
    'intros_sent', coalesce((select jsonb_agg(to_jsonb(i)) from social.intros i where i.sender = u), '[]'::jsonb),
    'intros_received', coalesce((select jsonb_agg(to_jsonb(i)) from social.intros i where i.recipient = u), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m)) from social.matches m where m.a = u or m.b = u), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(msg) order by msg.id)
      from social.messages msg
      join social.matches m on m.id = msg.thread
      where (m.a = u or m.b = u) and (msg.sender = u or msg.status = 'sent')
    ), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from social.blocks b where b.actor = u), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(to_jsonb(p)) from social.passes p where p.actor = u), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from social.reports r where r.reporter = u), '[]'::jsonb),
    'plus', (select to_jsonb(pl) from social.plus pl where pl.member = u),
    'boosts', coalesce((select jsonb_agg(to_jsonb(bo)) from social.boosts bo where bo.member = u), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from public.notification_events n where n.recipient = u), '[]'::jsonb),
    'media_files', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name, 'created_at', o.created_at))
      from storage.objects o
      where (o.bucket_id in ('verification-selfies','member-photos','member-voice') and split_part(o.name,'/',1) = u::text)
         or (o.bucket_id = 'chat-voice' and split_part(o.name,'/',2) = u::text)
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated.'; end if;
  -- Remove all user-owned files from storage buckets
  delete from storage.objects
  where (bucket_id in ('verification-selfies','member-photos','member-voice') and split_part(name,'/',1) = u::text)
     or (bucket_id = 'chat-voice' and (
       split_part(name,'/',2) = u::text
       or split_part(name,'/',1) in (select id::text from social.matches where a = u or b = u)
     ));
  -- Remove user-authored reports and anonymize target references
  delete from social.reports where reporter = u;
  update social.reports set peer = null, thread = null where peer = u;
  -- Delete auth user (cascades profiles, member_drafts, member_settings, cover_reviews, admin_users, notification_events, passes, blocks, plus, boosts, intros, matches, messages)
  delete from auth.users where id = u;
end $$;

-- Notification queue queries
create or replace function public.my_notifications() returns table(id bigint, kind text, title text, body text, data jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.title, n.body, n.data, n.created_at
  from public.notification_events n
  where n.recipient = auth.uid()
  order by n.id desc
  limit 30
$$;

create or replace function public.pending_push_notifications()
returns table(id bigint, push_token text, kind text, title text, body text, data jsonb)
language sql stable security definer set search_path = '' as $$
  select n.id, s.push_token, n.kind, n.title, n.body, n.data
  from public.notification_events n
  join public.member_settings s on s.user_id = n.recipient
  where n.sent_at is null
    and s.notifications_enabled
    and s.push_token is not null
  order by n.id
  limit 100
$$;

create or replace function public.mark_push_sent(ids bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_events set sent_at = now() where id = any(ids);
end $$;

-- Permissions
do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.is_admin()',
    'public.account_status()',
    'public.get_my_settings()',
    'public.update_my_settings(boolean,boolean,boolean)',
    'public.record_legal_acceptance()',
    'public.register_push_token(text,text)',
    'public.my_blocked_users()',
    'public.unblock_user(uuid)',
    'public.my_entitlements()',
    'public.activate_boost()',
    'public.mark_thread_read(uuid)',
    'public.chat_history(uuid,bigint)',
    'public.admin_dashboard()',
    'public.admin_review_selfie(uuid,boolean)',
    'public.admin_ban_user(uuid,text)',
    'public.admin_resolve_report(uuid,text,text)',
    'public.export_my_data()',
    'public.delete_my_account()',
    'public.my_notifications()'
  ]::regprocedure[] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  foreach f in array array[
    'public.set_plus_entitlement(uuid,boolean,timestamptz)',
    'public.pending_push_notifications()',
    'public.mark_push_sent(bigint[])'
  ]::regprocedure[] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
