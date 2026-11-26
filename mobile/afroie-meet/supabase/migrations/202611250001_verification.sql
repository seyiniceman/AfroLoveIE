create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  selfie_verified boolean not null default false,
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted','pending','approved','rejected')),
  date_of_birth date,
  selfie_path text,
  check (selfie_verified = (verification_status = 'approved'))
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
create policy read_own on public.profiles for select to authenticated using (user_id = auth.uid());

create function public.sync_auth_profile() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, phone_verified, email_verified)
  values (new.id, new.phone is not null and new.phone_confirmed_at is not null, new.email is not null and new.email_confirmed_at is not null)
  on conflict (user_id) do update set phone_verified = excluded.phone_verified, email_verified = excluded.email_verified;
  return new;
end $$;
revoke all on function public.sync_auth_profile() from public, anon, authenticated;
create trigger sync_profile after insert or update of phone, email, phone_confirmed_at, email_confirmed_at on auth.users
for each row execute function public.sync_auth_profile();
insert into public.profiles (user_id, phone_verified, email_verified)
select id, phone is not null and phone_confirmed_at is not null, email is not null and email_confirmed_at is not null from auth.users on conflict do nothing;

create function public.record_birthdate(birthdate date) returns void language plpgsql
security definer set search_path = '' as $$
begin
  if birthdate is null or birthdate > (current_date - interval '18 years')::date or birthdate < date '1900-01-01' then
    raise exception 'You must be at least 18 to join.';
  end if;
  update public.profiles set date_of_birth = birthdate
  where user_id = auth.uid() and phone_verified and email_verified and (date_of_birth is null or date_of_birth = birthdate);
  if not found then raise exception 'Unable to save date of birth.'; end if;
end $$;
revoke all on function public.record_birthdate(date) from public, anon;
grant execute on function public.record_birthdate(date) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('verification-selfies','verification-selfies',false,5242880,array['image/jpeg']);
create policy submit_own_selfie on storage.objects for insert to authenticated
with check (bucket_id = 'verification-selfies'
  and name ~ ('^' || auth.uid()::text || '/[a-zA-Z0-9-]+[.]jpg$')
  and exists (select 1 from public.profiles where user_id=auth.uid() and phone_verified and email_verified
    and date_of_birth <= (current_date - interval '18 years')::date and verification_status in ('not_submitted','rejected')));
create function public.mark_selfie_pending() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set verification_status='pending', selfie_verified=false, selfie_path=new.name
    where user_id=split_part(new.name,'/',1)::uuid and verification_status in ('not_submitted','rejected')
    and phone_verified and email_verified and date_of_birth <= (current_date - interval '18 years')::date;
  if not found then raise exception 'Selfie submission is unavailable.'; end if;
  return new;
end $$;
revoke all on function public.mark_selfie_pending() from public, anon, authenticated;
create trigger selfie_pending after insert on storage.objects for each row
when (new.bucket_id='verification-selfies') execute function public.mark_selfie_pending();

-- A trusted reviewer compares the saved image with the displayed pose before deciding.
create function public.review_selfie(object_path text, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set verification_status=case when approve then 'approved' else 'rejected' end,
    selfie_verified=approve where selfie_path=object_path and verification_status='pending';
  if not found then raise exception 'Pending submission not found.'; end if;
end $$;
revoke all on function public.review_selfie(text,boolean) from public,anon,authenticated;
grant execute on function public.review_selfie(text,boolean) to service_role;

create function public.verified_home() returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and email_verified and phone_verified
    and selfie_verified and verification_status='approved' and date_of_birth <= (current_date - interval '18 years')::date)
$$;
revoke all on function public.verified_home() from public, anon;
grant execute on function public.verified_home() to authenticated;

