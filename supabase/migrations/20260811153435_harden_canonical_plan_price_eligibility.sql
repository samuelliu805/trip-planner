-- Make the canonical price pair fully two-valued. PostgreSQL CHECK accepts an
-- unknown expression, so price_currency must be explicitly non-null when an
-- amount is present. Also enforce the one-anchor rental rule at the database.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.itinerary_items
  drop constraint itinerary_items_price_currency_pair;

alter table public.itinerary_items
  add constraint itinerary_items_price_currency_pair check (
    (price_amount is null and price_currency is null)
    or (
      price_amount is not null
      and price_currency is not null
      and price_currency ~ '^[A-Z]{3}$'
    )
  ),
  add constraint itinerary_items_price_eligible_type check (
    price_amount is null
    or (
      type not in ('location', 'note')
      and not (
        type = 'car_rental'
        and details ->> 'action' = 'return'
      )
    )
  );

comment on constraint itinerary_items_price_eligible_type on public.itinerary_items is
  'Known Cost excludes non-bookable rows and stores a Rental total only on its pickup anchor.';
