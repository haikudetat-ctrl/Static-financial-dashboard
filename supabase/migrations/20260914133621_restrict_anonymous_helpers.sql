-- These helpers are used by authenticated RLS policies, never anonymous callers.
revoke execute on function public.can_access_location(uuid) from public,anon;

revoke execute on function public.is_organization_manager(uuid) from public,anon;

revoke execute on function public.is_organization_member(uuid) from public,anon;

revoke execute on function public.shares_organization(uuid) from public,anon;

revoke execute on function public.storage_path_is_accessible(text) from public,anon;

revoke execute on function public.handle_new_user() from public,anon,authenticated;

grant execute on function public.can_access_location(uuid),public.is_organization_manager(uuid),public.is_organization_member(uuid),public.shares_organization(uuid),public.storage_path_is_accessible(text) to authenticated,service_role;

grant execute on function public.handle_new_user() to service_role;
