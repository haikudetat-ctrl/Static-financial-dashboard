begin;
select plan(7);

select is(public.fiscal_year_start(2026), date '2026-01-05', 'FY2026 starts on the first Monday of January');
select is(public.fiscal_year_start(2029), date '2029-01-01', 'A year starting on Jan 1 Monday keeps it');

select is(
  (select period_start from public.fiscal_periods(2026, '4-4-5') where period_number = 10),
  date '2026-10-05',
  'P10 FY2026 starts Oct 5'
);
select is(
  (select period_end from public.fiscal_periods(2026, '4-4-5') where period_number = 10),
  date '2026-11-01',
  'P10 FY2026 is four weeks'
);
select is(
  (select period_end - period_start + 1 from public.fiscal_periods(2026, '4-4-5') where period_number = 3),
  35,
  'The third period of a 4-4-5 quarter is five weeks'
);
select is(
  (select period_end - period_start + 1 from public.fiscal_periods(2029, '4-4-5') where period_number = 12),
  42,
  'A 53-week year puts the extra week in P12'
);
select is(
  (select count(*)::integer from public.fiscal_periods(2027, '4-5-4') a
     join public.fiscal_periods(2027, '4-5-4') b on b.period_number = a.period_number + 1
   where b.period_start <> a.period_end + 1),
  0,
  'Periods run back to back with no gaps'
);

select * from finish();
rollback;
