create function public.member_cards() returns table(user_id uuid, card jsonb)
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
 order by d.published_at desc limit 50
$$;
revoke all on function public.member_cards() from public,anon;
grant execute on function public.member_cards() to authenticated;

create function public.is_published_member_media(bucket text, object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.verified_home()
 and exists(select from public.member_drafts own where own.user_id=auth.uid() and own.published_at is not null)
 and exists(select from public.member_drafts d join public.profiles p on p.user_id=d.user_id
 where d.published_at is not null and p.verification_status='approved' and p.email_verified and p.phone_verified
 and ((bucket='member-photos' and (d.sections->'5'->'photos') ? object_path) or (bucket='member-voice' and d.sections->'8'->>'voice'=object_path)))
$$;
revoke all on function public.is_published_member_media(text,text) from public,anon;
grant execute on function public.is_published_member_media(text,text) to authenticated;
create policy published_profile_media on storage.objects for select to authenticated
using(bucket_id in ('member-photos','member-voice') and public.is_published_member_media(bucket_id,name));

