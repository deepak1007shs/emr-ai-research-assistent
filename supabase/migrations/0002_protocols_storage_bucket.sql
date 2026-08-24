-- Private bucket for the uploaded protocol files themselves.
-- Objects are stored as `{user_id}/{protocol_id}/{filename}`, so the first path
-- segment is what the policies check.

insert into storage.buckets (id, name, public, file_size_limit)
values ('protocols', 'protocols', false, 26214400)
on conflict (id) do nothing;

create policy protocol_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'protocols'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy protocol_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'protocols'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy protocol_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'protocols'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
