-- Create automated_workflows table
CREATE TABLE IF NOT EXISTS automated_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  triggers JSONB DEFAULT '[]',
  actions JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMP WITH TIME ZONE,
  success_rate DECIMAL(5,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_automated_workflows_enabled ON automated_workflows(enabled);
CREATE INDEX IF NOT EXISTS idx_automated_workflows_created_by ON automated_workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_automated_workflows_success_rate ON automated_workflows(success_rate DESC);

-- Enable RLS
ALTER TABLE automated_workflows ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own workflows" ON automated_workflows
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own workflows" ON automated_workflows
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own workflows" ON automated_workflows
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own workflows" ON automated_workflows
  FOR DELETE USING (created_by = auth.uid());
