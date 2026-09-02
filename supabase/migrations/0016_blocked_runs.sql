-- Prop Signal — a run nobody got a fair attempt at.
--
-- When the PropertyData account itself runs out of credits, the API answers
-- X04 and the wrapper treats it as fatal: retrying costs money and will not
-- work, so the run aborts. That part is right.
--
-- What was wrong is what happened next. Each profile gets its own client, so
-- the batch walked on to the next subscriber, made one doomed call, aborted,
-- and repeated — one wasted call per remaining subscriber. And because every
-- one of those attempts wrote a `pipeline_runs` row, the resumable batch read
-- them as "already attempted this cycle" and skipped those profiles for the
-- rest of the week.
--
-- So one subscriber exhausting the account did not cost the others a delay. It
-- cost them their Monday list entirely, silently, until the following Sunday.
--
-- 'blocked' is the distinction that fixes it: the run never happened, for a
-- reason that had nothing to do with this subscriber, and it should be tried
-- again rather than counted as done.

alter type public.run_status add value if not exists 'blocked';

comment on type public.run_status is
  'running, completed, failed, aborted, and blocked — blocked meaning the account was out of credits and this profile never got an attempt.';
