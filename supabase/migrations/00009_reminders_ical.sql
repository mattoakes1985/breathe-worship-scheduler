-- Reminders (§12: default 3 days before, per notification_preferences) and
-- per-volunteer iCal calendar tokens.

-- Daily reminder fan-out (in-app now; the email dispatch function reads the
-- same notifications table once a Resend key exists).
create extension if not exists pg_cron;

create or replace function send_service_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into notifications (profile_id, type, title, body, related_service_id, sent_via)
  select a.profile_id, 'reminder', 'You''re serving soon',
         'Reminder: you''re on the rota for ' || s.title || ' on ' ||
         to_char(s.service_date, 'Day DD Mon') || ' at ' || to_char(s.start_time, 'HH24:MI') ||
         case when a.status = 'invited' then ' — please confirm.' else '.' end,
         s.id, 'in_app'
  from assignments a
  join services s on s.id = a.service_id
  left join notification_preferences np on np.profile_id = a.profile_id
  where s.status = 'published'
    and a.status in ('confirmed', 'invited')
    and s.service_date = current_date + coalesce(np.reminder_days_before, 3)
    and coalesce(np.push_enabled, true)
    and not exists (
      select 1 from notifications n
      where n.profile_id = a.profile_id and n.related_service_id = s.id and n.type = 'reminder'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function send_service_reminders() from anon, authenticated, public;

select cron.schedule('service-reminders', '0 7 * * *', 'select send_service_reminders()');

-- iCal: unguessable per-volunteer token; feed served by the my-rota Edge Function.
alter table profiles add column calendar_token uuid not null unique default gen_random_uuid();
