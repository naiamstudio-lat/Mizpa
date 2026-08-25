-- Mizpa Database Schema
-- Tasks, VM sessions, and results for the agent playground

-- Tasks table - tracks each agent task
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  skill text not null check (skill in ('replica', 'audit', 'generate')),
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  vm_id text,
  vm_token text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Task results - stores output from agent execution
create table public.task_results (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  result_type text not null check (result_type in ('audit', 'replica', 'frontend', 'log', 'error')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- VM sessions - tracks VM lifecycle for debugging/billing
create table public.vm_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  vm_id text not null,
  status text not null default 'creating' check (status in ('creating', 'running', 'stopping', 'stopped', 'deleted')),
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Indexes for common queries
create index idx_tasks_user_id on public.tasks(user_id);
create index idx_tasks_status on public.tasks(status);
create index idx_task_results_task_id on public.task_results(task_id);
create index idx_vm_sessions_task_id on public.vm_sessions(task_id);

-- Row Level Security (RLS)
alter table public.tasks enable row level security;
alter table public.task_results enable row level security;
alter table public.vm_sessions enable row level security;

-- Users can only see their own tasks
create policy "Users can view own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can create tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

-- Users can only see results of their own tasks
create policy "Users can view own task results"
  on public.task_results for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_results.task_id
      and tasks.user_id = auth.uid()
    )
  );

-- Users can only see VM sessions of their own tasks
create policy "Users can view own vm sessions"
  on public.vm_sessions for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = vm_sessions.task_id
      and tasks.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for tasks updated_at
create trigger tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.handle_updated_at();
