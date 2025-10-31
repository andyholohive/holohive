-- Create campaign_reports table
CREATE TABLE IF NOT EXISTS public.campaign_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    custom_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create campaign_report_files table
CREATE TABLE IF NOT EXISTS public.campaign_report_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    is_public BOOLEAN DEFAULT false NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add columns to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS share_report_publicly BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS report_share_link TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campaign_reports_campaign_id ON public.campaign_reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_report_files_campaign_id ON public.campaign_report_files(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_report_files_is_public ON public.campaign_report_files(is_public);
CREATE INDEX IF NOT EXISTS idx_campaign_report_files_display_order ON public.campaign_report_files(display_order);

-- Enable Row Level Security
ALTER TABLE public.campaign_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_report_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaign_reports
CREATE POLICY "Users can view reports for their campaigns" ON public.campaign_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_reports.campaign_id
        )
    );

CREATE POLICY "Users can insert reports for their campaigns" ON public.campaign_reports
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_reports.campaign_id
        )
    );

CREATE POLICY "Users can update reports for their campaigns" ON public.campaign_reports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_reports.campaign_id
        )
    );

-- RLS Policies for campaign_report_files
CREATE POLICY "Users can view files for their campaigns" ON public.campaign_report_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_report_files.campaign_id
        )
        OR is_public = true
    );

CREATE POLICY "Authenticated users can insert files" ON public.campaign_report_files
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_report_files.campaign_id
        )
    );

CREATE POLICY "Users can update their campaign files" ON public.campaign_report_files
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_report_files.campaign_id
        )
    );

CREATE POLICY "Users can delete their campaign files" ON public.campaign_report_files
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_report_files.campaign_id
        )
    );

-- Create updated_at trigger for campaign_reports
CREATE OR REPLACE FUNCTION public.update_campaign_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_reports_updated_at
    BEFORE UPDATE ON public.campaign_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_campaign_reports_updated_at();

-- Grant permissions
GRANT ALL ON public.campaign_reports TO authenticated;
GRANT ALL ON public.campaign_report_files TO authenticated;
GRANT SELECT ON public.campaign_report_files TO anon;
