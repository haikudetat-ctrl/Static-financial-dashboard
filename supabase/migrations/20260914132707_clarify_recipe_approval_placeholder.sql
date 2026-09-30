-- This remains an explicitly unsupported endpoint. Initialize its result contract
-- and include supplied identifiers in error diagnostics instead of unused inputs.
create or replace function public.approve_recipe_candidate(
  target_candidate_id uuid,
  target_revision_id uuid
)
returns table (recipe_id uuid, recipe_version_id uuid, already_approved boolean)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  recipe_id := null;
  recipe_version_id := null;
  already_approved := false;
  raise exception 'Recipe candidate approval is not implemented'
    using detail = format('Candidate %s, revision %s', target_candidate_id, target_revision_id);
end;
$$;
