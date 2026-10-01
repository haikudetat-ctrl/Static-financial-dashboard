-- Price drops get their own alert type.
alter type public.price_alert_type add value if not exists 'cost_decrease';
