-- Rastreo de cuántos carros ENTRAN a cada yarda por semana.
-- Se agrupa por yard_date (la fecha que la yarda le pone al carro), no por
-- first_seen, porque first_seen solo dice cuándo lo vimos NOSOTROS.
--
-- OJO con la lectura histórica: de las semanas ANTERIORES a nuestra primera
-- lectura completa del inventario solo vemos los carros que TODAVÍA siguen
-- en la yarda — los que entraron y ya se fueron nunca los vimos. Por eso la
-- columna `exacto`: false = piso mínimo (va a subestimar), true = conteo real.
create or replace view entradas_semanales as
select
  yi.yard,
  date_trunc('week', yi.yard_date)::date                    as semana,
  count(*)::int                                             as carros,
  date_trunc('week', yi.yard_date)::date
    >= (select date_trunc('week', min(first_seen))::date
        from yard_inventory)                                as exacto
from yard_inventory yi
where yi.yard_date is not null
  and yi.yard_date >= current_date - interval '180 days'
group by 1, 2;

comment on view entradas_semanales is
  'Carros que entraron por semana y por yarda. exacto=false: semana anterior a nuestra primera lectura, subestima porque no vemos los carros que ya se fueron.';
