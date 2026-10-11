-- 2026-10-11 (Matt: "make sure the previous services are all Sundays").
-- 00015 moved only upcoming services. This moves the remaining 26
-- template-generated services (2026-07-04 .. 2026-10-03) from the Saturday
-- the BST bug put them on to the Sunday they belong to. Assignments, songs
-- and plans stay attached (they reference the service, not the date).
-- Deliberately NOT moved: the 35 non-template services on other weekdays.
-- They are genuine events from the imported history (weddings, men's
-- breakfasts, conferences, midweek gatherings, Christmas Day), and their
-- dates were checked as correct (including winter Saturdays, which the BST
-- bug could not have caused).
update services set service_date = service_date + 1, updated_at = now()
where archived_at is null and template_id is not null and extract(dow from service_date) = 6;
