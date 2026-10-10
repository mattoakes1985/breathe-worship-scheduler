-- WO-1 song data reconcile (run 2026-10-10 against live data, approved by Matt).
-- Source of truth = the app's existing values; 2021-26 setlist history
-- (data/evidence/song_history_evidence.csv: played keys / BPM mode / time-sig
-- mode) is evidence only. Gaps are filled; every disagreement goes to the
-- "Needs checking" queue (song_review_items) for a human — nothing overwritten.
-- The uploaded spreadsheet is NOT used (its BPM column is corrupt).
-- History rows written by this script carry op='import'.
-- Idempotent: re-running adds nothing (new songs / review items are guarded).
begin;
select set_config('app.song_op', 'import', true);

create temp table ev (title text, keys text[], played_bpm int, played_ts text, seen int);
insert into ev values
('All about you',array['A','D']::text[],98,'4/4',3),
('All hail king Jesus',array['F']::text[],74,'4/4',2),
('Always so good',array['E','C']::text[],73,'4/4',4),
('Another In The Fire',array['C']::text[],67,'4/4',1),
('Awake My Soul',array['F']::text[],127,'4/4',3),
('Bless God',array['A']::text[],73,'4/4',1),
('Build my life',array['D']::text[],70,'4/4',1),
('Can''t help but worship',array['A']::text[],127,'4/4',1),
('Crowns down',array['A','F']::text[],72,'4/4',6),
('Deep down',array['D']::text[],120,null,1),
('Echoes (Till we see the other side)',array['E']::text[],142,'4/4',1),
('Everything and nothing less',array['F']::text[],72,'4/4',1),
('Faithful Now',array['E']::text[],74,'4/4',1),
('Faithful then, faithful now',array['G','D']::text[],107,'4/4',9),
('Firm Foundation',array['G','C']::text[],75,'6/8',4),
('Freedom (Hillsong)',array['A','E']::text[],75,'4/4',3),
('Freedom is coming',array['G']::text[],94,'4/4',1),
('Give me Jesus',array['E','C','G']::text[],70,'4/4',4),
('Glorious Day',array['C','D']::text[],110,'4/4',3),
('God I''m just grateful for you',array['F']::text[],72,'4/4',1),
('God So Loved',array['G','Bb']::text[],100,'4/4',6),
('Good Grace',array['G']::text[],71,'4/4',2),
('Goodbye yesterday',array['D','G']::text[],75,'4/4',5),
('Goodness of God',array['G']::text[],63,null,1),
('Gratitude',array['F','A']::text[],52,'6/8',2),
('Graves into Gardens',array['A','G']::text[],46,'6/8',2),
('Hark Hallelujah',array['D']::text[],127,null,1),
('Here Again',array['C','F']::text[],68,'4/4',3),
('Highest praise (we get low)',array['G','E']::text[],72,'4/4',3),
('Holy forever',array['F']::text[],72,'4/4',1),
('House of Miracles',array['E']::text[],72,'4/4',2),
('House of the Lord',array['D']::text[],86,'4/4',3),
('How He loves',array['C']::text[],49,'6/8',2),
('I Got Saved',array['C','B']::text[],82,'6/8',5),
('I know a name',array['A','E']::text[],58,'6/8',9),
('I Speak Jesus',array['E']::text[],74,'4/4',2),
('I surrender all (BNL version)',array['C']::text[],74,'4/4',1),
('I Thank God',array['F','G','A']::text[],130,'4/4',5),
('I''ve Got a Fire',array['E','F']::text[],150,'4/4',2),
('Jehovah',array['A']::text[],100,'4/4',5),
('Jesus be the name',array['G']::text[],64,'4/4',2),
('Jesus over everything',array['D']::text[],74,'4/4',1),
('Joy (what the world calls foolish)',array['F','C','A']::text[],124,'4/4',7),
('King of Kings',array['D']::text[],68,'4/4',1),
('Left it in the river',array['Ab']::text[],98,'4/4',1),
('Made for more',array['C','A']::text[],75,'3/8',6),
('Make room',array['C','F']::text[],62,'4/4',3),
('Mercy',array['A','G']::text[],65,'4/4',2),
('Mighty name of Jesus',array['F','A']::text[],72,'4/4',6),
('My King forever',array['E','A']::text[],144,'6/8',5),
('New thing coming',array['A','Eb']::text[],91,'4/4',3),
('No body',array['A','C']::text[],67,'4/4',3),
('No longer slaves',array['F']::text[],74,'4/8',1),
('No one (Yahweh)',array['G','E']::text[],136,'4/4',4),
('O Praise the Name (Anástasis)',array['C']::text[],72,'4/4',1),
('Only ever good',array['E','A']::text[],82,'4/4',9),
('Pour your spirit out',array['A','F']::text[],70,'4/4',2),
('Praise God (Doxology)',array['E','A']::text[],126,'4/4',3),
('Praise the Lord Forever',array['G']::text[],68,'4/4',2),
('Praise!',array['E','D']::text[],127,'4/4',8),
('Raise a hallelujah',array['Db']::text[],82,'4/4',1),
('Same God',array['C']::text[],72,'4/4',1),
('Shine for you',array['E','G']::text[],118,'4/4',5),
('Simple Kingdom',array['C']::text[],190,'6/8',2),
('So so good',array['C','G']::text[],116,'4/4',5),
('Take You at Your Word',array['C']::text[],115,'4/4',3),
('That''s my king',array['D','A']::text[],95,'4/4',13),
('That''s the Power',array['A']::text[],74,'4/4',1),
('That''s who I praise',array['D','A']::text[],112,'4/4',9),
('The Blessing',array['G']::text[],70,'4/4',1),
('The Blood',array['A','F','C']::text[],74,'4/4',4),
('The Church will Rise',array['G','A','D']::text[],77,'4/4',5),
('The King is in the room',array['G']::text[],98,'4/4',1),
('The Way (New Horizon)',array['A']::text[],80,'4/4',1),
('This is our God',array['G','C']::text[],80,'4/4',4),
('This is the kingdom',array['A']::text[],73,'6/8',1),
('Way Maker',array['G']::text[],68,'4/4',1),
('We believe',array['F']::text[],66,'4/4',1),
('What a Beautiful Name',array['D']::text[],68,'4/4',1),
('What a God',array['A','Ab','G']::text[],79,'4/4',5),
('What He''s done',array['Db','D']::text[],71,'4/4',2),
('What I See',array['A']::text[],148,'4/4',2),
('Who else?',array['G','C','F']::text[],68,'4/4',3),
('Who You Say I Am',array['G','C']::text[],58,'6/8',3),
('Words we''ll sing forever',array['A']::text[],73,'4/4',3),
('Worship!',array['D','C']::text[],130,'4/4',6),
('Worthy of it all',array['E']::text[],69,'4/4',1),
('Yahweh (Thrive worship)',array['G','E']::text[],152,'6/8',7),
('Yes I Will',array['G']::text[],75,'4/4',1),
('You Say',array['F']::text[],74,'4/4',1);

-- 1. Songs sung in history but missing from the app (Matt: "add the songs").
insert into songs (title, artist, tempo_bpm, time_signature, legacy_played_keys, notes)
select v.title, v.artist, e.played_bpm, e.played_ts, e.keys,
       'Added 2026-10-10 from setlist history (sung ' || e.seen || 'x). Keys/BPM from setlists; female/male key not yet set.'
from (values
  ('God I''m just grateful for you', 'Elevation Worship & Chandler Moore'),
  ('Jesus be the name', 'Elevation Worship'),
  ('I''ve Got a Fire', null),
  ('What a God', null)
) v(title, artist)
join ev e on e.title = v.title
where not exists (select 1 from songs s where lower(s.title) = lower(v.title));

insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence)
select s.id, 'added_from_history', 'is_active', 'true', 'true',
       'Sung ' || e.seen || 'x in 2021-26 setlists (keys: ' || array_to_string(e.keys, ', ') ||
       '; about ' || e.played_bpm || ' bpm ' || coalesce(e.played_ts, '') || '). Added to the library on 2026-10-10 — accept to keep, or archive it.'
from songs s join ev e on lower(e.title) = lower(s.title)
where s.notes like 'Added 2026-10-10 from setlist history%'
  and not exists (select 1 from song_review_items r where r.song_id = s.id and r.kind = 'added_from_history');

-- 2. Played keys (most frequent first) for every song with history.
update songs s set legacy_played_keys = e.keys
from ev e where lower(e.title) = lower(s.title) and s.legacy_played_keys is distinct from e.keys;

-- 3. Classify each song against played history (same rules as the preview).
create temp table cls as
select s.id, s.title, s.tempo_bpm as app_bpm, s.time_signature as app_ts, e.played_bpm, e.played_ts, e.seen,
  case
    when e.played_bpm is null then 'none'
    when s.tempo_bpm is null then 'fill'
    when abs(e.played_bpm - s.tempo_bpm) <= greatest(3, s.tempo_bpm * 0.06) then 'ok'
    when abs(e.played_bpm - 2 * s.tempo_bpm) <= s.tempo_bpm * 0.16 then 'double'
    when abs(2 * e.played_bpm - s.tempo_bpm) <= s.tempo_bpm * 0.08 then 'half'
    else 'conflict' end as bpm_check
from songs s join ev e on lower(e.title) = lower(s.title);

-- 3a. Fill missing BPM / time signature straight from history (logged as info).
insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence, status, resolution_note)
select id, 'bpm_filled_from_history', 'tempo_bpm', null, played_bpm::text,
       'App had no BPM; most common played BPM across ' || seen || ' setlist(s).', 'info', 'Applied automatically 2026-10-10'
from cls where bpm_check = 'fill'
  and not exists (select 1 from song_review_items r where r.song_id = cls.id and r.kind = 'bpm_filled_from_history');
update songs s set tempo_bpm = c.played_bpm, time_signature = coalesce(s.time_signature, c.played_ts)
from cls c where c.id = s.id and c.bpm_check = 'fill';

-- 3b. BPM conflicts -> Needs checking (suggest the played value).
insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence)
select id, 'bpm_conflict', 'tempo_bpm', app_bpm::text, played_bpm::text,
       'App says ' || app_bpm || ' bpm; your setlists most often say ' || played_bpm || ' bpm (' || seen || ' setlist(s)).' ||
       case when played_bpm::numeric / app_bpm between 1.6 and 2.0 then ' Close to double — may be a double-time count rather than a wrong BPM.' else '' end
from cls c where bpm_check = 'conflict'
  and not exists (select 1 from song_review_items r where r.song_id = c.id and r.kind = 'bpm_conflict' and r.status = 'open');

-- 3c. Half/double-time -> Needs checking (annotate feel, keep the BPM).
insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence)
select id, 'bpm_half_double', 'bpm_feel', null,
       case when bpm_check = 'double' then 'double-time' else 'half-time' end,
       'App says ' || app_bpm || ' bpm; your setlists say ' || played_bpm || ' (about ' ||
       case when bpm_check = 'double' then 'double' else 'half' end || '). Accepting keeps ' || app_bpm || ' and notes the feel.'
from cls c where bpm_check in ('double', 'half')
  and not exists (select 1 from song_review_items r where r.song_id = c.id and r.kind = 'bpm_half_double' and r.status = 'open');

-- 3d. Time signature differs -> Needs checking.
insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence)
select c.id, 'time_signature', 'time_signature', s.time_signature, c.played_ts,
       'App says ' || s.time_signature || '; your setlists say ' || c.played_ts || '.' ||
       case when c.played_ts = '4/8' then ' 4/8 is unusual — probably a typo in the old setlist; rejecting keeps ' || s.time_signature || '.' else '' end
from cls c join songs s on s.id = c.id
where c.played_ts is not null and s.time_signature is not null and s.time_signature <> c.played_ts
  and not exists (select 1 from song_review_items r where r.song_id = c.id and r.kind = 'time_signature' and r.status = 'open');

-- 4. Artist suggestions (unverified; nothing changes until accepted).
insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence, source)
select s.id, 'artist_suggestion', 'artist', null, a.artist,
       'Artist missing. Suggested from general knowledge (confidence: ' || a.conf || ') — please verify.',
       'Claude suggestion (unverified)'
from (values
('Everything and nothing less','Chris Renzema','high'),
('Faithful then, faithful now','Elevation Worship','high'),
('Goodbye yesterday','Elevation Rhythm','high'),
('Great Things (Worth it all)','Phil Wickham','high'),
('In the River','Jesus Culture','high'),
('Made for more','Josh Baldwin','high'),
('Mighty name of Jesus','Hope Darst','high'),
('That''s who I praise','Brandon Lake','high'),
('There is a cloud','Elevation Worship','high'),
('This is the kingdom','Elevation Worship','high'),
('Who else?','Gateway Worship','high'),
('Yahweh (Thrive worship)','Thrive Worship','high (named in the title)'),
('Yes I Will','Vertical Worship','high'),
('I know a name','Elevation Worship','high'),
('O Little Town (Glory of Christmas)','Chris Tomlin','high'),
('I Exalt Thee','Pete Sanchez Jr. (writer)','medium'),
('Available','Elevation Worship','medium'),
('Fullness','Elevation Worship','medium'),
('I Will Boast','Paul Baloche','medium'),
('Joy of the Lord','Rend Collective','medium (Twila Paris also has a song with this title)'),
('When Hope Came Down','Kari Jobe','medium'),
('Yours (Glory and Praise)','Elevation Worship','medium')
) a(title, artist, conf)
join songs s on lower(s.title) = lower(a.title)
where s.artist is null
  and not exists (select 1 from song_review_items r where r.song_id = s.id and r.kind = 'artist_suggestion' and r.status = 'open');

insert into song_review_items (song_id, kind, field, current_value, suggested_value, evidence, source)
select s.id, 'artist_suggestion', 'artist', null, null, v.note, 'web search 2026-10-10'
from (values
  ('I''ve Got a Fire', 'Two different songs share this title: Pat Barrett and Lakewood Music / Tauren Wells. Your setlists have it at about 150 bpm in E/F — type the right artist when accepting.'),
  ('What a God', 'Several songs share this title (e.g. Joel Barber & Chroma Worship, and others). Your setlists have it at about 79 bpm in A — type the right artist when accepting.')
) v(title, note)
join songs s on lower(s.title) = lower(v.title)
where s.artist is null
  and not exists (select 1 from song_review_items r where r.song_id = s.id and r.kind = 'artist_suggestion' and r.status = 'open');

select set_config('app.song_op', '', true);
commit;
