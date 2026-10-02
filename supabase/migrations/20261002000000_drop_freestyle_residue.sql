-- Drop the freestyle and Cloudflare Pages residue now that the agent runtime is fx.
--
-- Context: run-agent, cleanup-vms and the freestyle client are deleted. Nothing
-- writes or reads these columns any more — ActiveSites selects only
-- (id, name, status, created_at) and AgentChat only (id, name). They were the
-- VM lifecycle, and there is no VM lifecycle left to model.
--
-- The Pages URLs that some rows carried are preserved in the operator's local
-- backup taken before this migration. The Cloudflare projects themselves live in
-- the operator's Cloudflare account and are out of scope for this repository.
--
-- Legacy queue tables go for the same reason: task_queue, tasks, task_results and
-- vm_sessions are the freestyle task pipeline. No frontend query references them
-- (verified by grep over src/ before applying). active_vm_count() reads
-- task_queue, so it is dropped first — leaving it would be a function that
-- raises at runtime rather than a clean removal.
--
-- This migration only removes objects. The fx path (sites.runtime,
-- sites.runtime_session, site-checkpoints, fx_quota, fx_settle_quota) is
-- untouched.

-- --- functions that depend on the tables below -------------------------------
drop function if exists public.active_vm_count();
drop function if exists public.check_organization_billing_semaphore(uuid);

-- --- legacy freestyle task pipeline ------------------------------------------
drop table if exists public.vm_sessions;
drop table if exists public.task_results;
drop table if exists public.tasks;
drop table if exists public.task_queue;

-- --- freestyle and Cloudflare residue on sites --------------------------------
-- order matters: check_organization_billing_semaphore and the sites policies above
-- are gone with the tables, these columns are leaf dependencies.
alter table public.sites
  drop column if exists freestyle_vm_id,
  drop column if exists freestyle_repo_id,
  drop column if exists cloudflare_project_name,
  drop column if exists cloudflare_pages_url;
