create table public.member_drafts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 step integer not null default 1 check(step between 1 and 9),
 sections jsonb not null default '{}',
 published_at timestamptz
);
alter table public.member_drafts enable row level security;
revoke all on public.member_drafts from public,anon,authenticated;
grant select on public.member_drafts to authenticated;
create policy own_draft on public.member_drafts for select to authenticated using(user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('member-photos','member-photos',false,5242880,array['image/jpeg']),
 ('member-voice','member-voice',false,5242880,array['audio/webm','audio/mp4','audio/m4a','audio/x-m4a']);
create policy member_upload on storage.objects for insert to authenticated with check (
 bucket_id in ('member-photos','member-voice') and (storage.foldername(name))[1]=auth.uid()::text and public.verified_home()
);
create policy member_media_read on storage.objects for select to authenticated using (
 bucket_id in ('member-photos','member-voice') and (storage.foldername(name))[1]=auth.uid()::text
);
create table public.cover_reviews (
 object_path text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected'))
);
alter table public.cover_reviews enable row level security;
revoke all on public.cover_reviews from public,anon,authenticated;
grant select on public.cover_reviews to authenticated;
create policy own_cover_reviews on public.cover_reviews for select to authenticated using(user_id=auth.uid());
create function public.request_cover_review(photo text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_home() or split_part(photo,'/',1)<>auth.uid()::text or not exists(select from storage.objects where bucket_id='member-photos' and name=photo) then raise exception 'Choose your uploaded photo.'; end if;
 insert into public.cover_reviews(object_path,user_id) values(photo,auth.uid()) on conflict do nothing;
 return (select status from public.cover_reviews where object_path=photo);
end $$;
revoke all on function public.request_cover_review(text) from public,anon;
grant execute on function public.request_cover_review(text) to authenticated;
grant select,update(status) on public.cover_reviews to service_role;

create function public.save_member_step(stage int, entry jsonb) returns public.member_drafts
language plpgsql security definer set search_path='' as $$
declare draft public.member_drafts; k text; keys text[]; item jsonb; photos text[]; prompts text[]; verified_dob date;
begin
 if not public.verified_home() then raise exception 'Complete verification first.'; end if;
 insert into public.member_drafts(user_id) values(auth.uid()) on conflict do nothing;
 select * into draft from public.member_drafts where user_id=auth.uid() for update;
 if stage is null or stage<1 or stage>draft.step or stage>9 or draft.published_at is not null then raise exception 'Complete the current step first.'; end if;
 if entry is null or jsonb_typeof(entry)<>'object' or length(entry::text)>16000 then raise exception 'Invalid step data.'; end if;
 keys=case stage when 1 then array['name','dob','gender','location','height'] when 2 then array['origin','languages','religion']
 when 3 then array['intent'] when 4 then array['kids','smoking','drinking','education','occupation'] else array[]::text[] end;
 foreach k in array keys loop
 if jsonb_typeof(entry->k) is distinct from 'string' or length(trim(entry->>k)) not between 1 and 160 then raise exception 'Complete the required fields.'; end if;
 end loop;
 if stage=1 then
 select date_of_birth into verified_dob from public.profiles where user_id=auth.uid();
 if entry->>'dob'<>verified_dob::text or entry->>'location' !~ '^(Dublin ([1-9]|1[0-9]|2[0-4])|Cork|Galway|Limerick)$' or entry->>'height' !~ '^[0-9]{2,3}$' or (entry->>'height')::int not between 50 and 275 then raise exception 'Check your birth date, location and height in cm.'; end if;
 elsif stage=3 and entry->>'intent' not in ('Serious Relationship','Marriage','Dating','Friendship','Networking') then raise exception 'Choose one intention.';
 elsif stage=5 then
 if jsonb_typeof(entry->'photos') is distinct from 'array' then raise exception 'Choose 3 to 6 photos.'; end if;
 photos=array(select jsonb_array_elements_text(entry->'photos'));
 if cardinality(photos) not between 3 and 6 or (select count(distinct p) from unnest(photos) p)<>cardinality(photos)
 or exists(select from unnest(photos) p where split_part(p,'/',1)<>auth.uid()::text or not exists(select from storage.objects where bucket_id='member-photos' and name=p)) then raise exception 'Choose 3 to 6 different uploaded photos.'; end if;
 if not exists(select from public.cover_reviews where object_path=photos[1] and status='approved') then raise exception 'The first photo needs face approval.'; end if;
 elsif stage=6 then
 if jsonb_typeof(entry->'answers') is distinct from 'array' or jsonb_array_length(entry->'answers')<>3 then raise exception 'Choose three prompts.'; end if;
 prompts=array[]::text[];
 for item in select jsonb_array_elements(entry->'answers') loop
 if coalesce(item->>'prompt','') not in ('My ideal Saturday in Ireland…','A tradition I would love to share…','My favourite way to meet someone…','A skill I could teach you…','My friends know me for…','A place I want to explore…') or item->>'prompt'=any(prompts)
 or jsonb_typeof(item->'answer') is distinct from 'string' or length(trim(item->>'answer')) not between 30 and 1000 then raise exception 'Pick three distinct prompts and answer each in 30–1,000 characters.'; end if;
 prompts=array_append(prompts,item->>'prompt'); end loop;
 elsif stage=7 and (jsonb_typeof(entry->'bio') is distinct from 'string' or length(trim(entry->>'bio')) not between 100 and 500) then raise exception 'Write a bio of 100–500 characters.';
 elsif stage=8 and entry ? 'voice' then
 if jsonb_typeof(entry->'duration') is distinct from 'number' or (entry->>'duration')::numeric not between 1 and 15000 or split_part(entry->>'voice','/',1)<>auth.uid()::text or not exists(select from storage.objects where bucket_id='member-voice' and name=entry->>'voice') then raise exception 'Choose a recording up to 15 seconds.'; end if;
 elsif stage=9 then
 if (select count(*) from jsonb_object_keys(draft.sections))<>8 or not exists(select from public.cover_reviews where object_path=draft.sections->'5'->'photos'->>0 and status='approved') then raise exception 'Complete every step before publishing.'; end if;
 update public.member_drafts set published_at=now() where user_id=auth.uid() returning * into draft; return draft;
 end if;
 update public.member_drafts set sections=jsonb_set(sections,array[stage::text],entry), step=greatest(step,least(stage+1,9)) where user_id=auth.uid() returning * into draft;
 return draft;
end $$;
revoke all on function public.save_member_step(int,jsonb) from public,anon;
grant execute on function public.save_member_step(int,jsonb) to authenticated;

