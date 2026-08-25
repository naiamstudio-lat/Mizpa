-- Mizpa Task Queue and Sites Schema
-- Migration: 20260806200000

-- Task Queue Table
CREATE TABLE IF NOT EXISTS task_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  vm_id TEXT,
  error_log TEXT,
  output TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_task_queue_site_status ON task_queue(site_id, status);
CREATE INDEX IF NOT EXISTS idx_task_queue_status_created ON task_queue(status, created_at);

-- Sites Table (tracks deployed sites)
CREATE TABLE IF NOT EXISTS sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT,
  source_url TEXT,
  freestyle_repo_id TEXT,
  freestyle_vm_id TEXT,
  cloudflare_project_name TEXT,
  cloudflare_pages_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'deployed', 'failed', 'destroyed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for sites
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);

-- Enable Realtime for task_queue
ALTER PUBLICATION supabase_realtime ADD TABLE task_queue;

-- RPC: Check organization billing semaphore
CREATE OR REPLACE FUNCTION check_organization_billing_semaphore(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- For now, always return true (no billing limits)
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- RPC: Get active VM count
CREATE OR REPLACE FUNCTION active_vm_count()
RETURNS INTEGER AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*) INTO count FROM task_queue WHERE status = 'processing';
  RETURN count;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access" ON task_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to sites" ON sites
  FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to read their own tasks
CREATE POLICY "Users can read own tasks" ON task_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = task_queue.site_id 
      AND sites.user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert tasks for their sites
CREATE POLICY "Users can insert own tasks" ON task_queue
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = site_id 
      AND sites.user_id = auth.uid()
    )
  );

-- Allow authenticated users to read their own sites
CREATE POLICY "Users can read own sites" ON sites
  FOR SELECT USING (auth.uid() = user_id);

-- Allow authenticated users to create sites
CREATE POLICY "Users can create own sites" ON sites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
