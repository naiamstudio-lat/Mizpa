-- Add 'queued' to tasks status check constraint
alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status = any (array['pending', 'queued', 'running', 'completed', 'failed']));

-- Note: pgmq extension must be enabled separately via:
--   create extension if not exists pgmq;
--   select pgmq.create('mizpa-tasks');
