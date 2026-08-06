-- Align period close with the canonical daily_theoretical_usage column names.

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.close_period(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'sum(total_cost)',
    'sum(theoretical_cost)'
  );
  function_definition := replace(
    function_definition,
    'sum(total_usage) as total_usage',
    'sum(quantity_base) as total_usage'
  );

  if function_definition not like '%sum(theoretical_cost)%'
    or function_definition not like '%sum(quantity_base) as total_usage%'
  then
    raise exception 'close_period definition did not contain expected theoretical usage expressions';
  end if;

  execute function_definition;
end;
$migration$;
