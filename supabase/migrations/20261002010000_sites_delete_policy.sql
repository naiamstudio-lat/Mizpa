-- Let an owner delete their own site.
--
-- `sites` had RLS for SELECT, INSERT and UPDATE but never for DELETE, and a
-- missing policy is not an error: PostgREST answers 204 with no body, the client
-- reports no failure, the row leaves the local list, and it reappears on the
-- next reload. The delete button looked like it worked and never did.
--
-- Same shape as the existing owner policies, so the row is only removable by
-- whoever owns it, and a service-role client still bypasses this entirely.
create policy "Users can delete own sites" on public.sites
  for delete
  using (auth.uid() = user_id);
