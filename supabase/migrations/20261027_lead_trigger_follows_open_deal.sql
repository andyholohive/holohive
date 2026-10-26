-- A contact marked Lead must land on the board [Andy 2026-10-27: "projects
-- marked as lead are still not showing up in New Lead"].
--
-- The trigger only promoted a deal sitting in prospect / orbit. A contact
-- still linked to an archived copy (the 10-26 one-card-per-project merge left
-- some links on the merged-away duplicate, and the Aug-14 import archived
-- others) or to a lost deal updated that row and nothing showed.
--
-- Now: an archived or lost link gives way to the project's open deal; with
-- no open deal the linked one comes back. Archived deals are unarchived;
-- prospect / orbit / lost / unset deals start again at New Lead, and a deal
-- already further along keeps its stage. Won deals are left alone: that is a
-- client, not a lead.

create or replace function public.fn_outreach_lead_to_pipeline()
returns trigger language plpgsql as $fn$
declare
  new_in boolean;
  old_in boolean;
  opp_id uuid;
  open_id uuid;
  stale boolean := false;
  company_key text := lower(btrim(coalesce(new.company, '')));
begin
  new_in := new.status in ('lead', 'lead_trial');
  old_in := tg_op = 'UPDATE' and old.status in ('lead', 'lead_trial');

  if not new_in or old_in then
    return new;
  end if;

  opp_id := new.crm_opportunity_id;

  if opp_id is not null then
    select o.archived_at is not null or o.pipeline_stage = 'closed_lost' into stale
      from crm_opportunities o where o.id = opp_id;
  end if;

  -- No deal linked, or only a dead copy: the company's open deal wins.
  -- pipeline_stage is an enum, so the null case is spelled out.
  if (opp_id is null or stale) and company_key <> '' then
    select o.id into open_id
      from crm_opportunities o
     where lower(btrim(o.name)) = company_key
       and o.archived_at is null
       and (o.pipeline_stage is null or o.pipeline_stage not in ('closed_won', 'closed_lost'))
     order by (o.pipeline_stage in ('prospect', 'orbit')) nulls last, o.created_at
     limit 1;
    if open_id is not null then opp_id := open_id; end if;
  end if;

  if opp_id is not null then
    update crm_opportunities
       set pipeline_stage = case
             when pipeline_stage is null or pipeline_stage in ('prospect', 'orbit', 'closed_lost')
             then 'new_lead' else pipeline_stage end,
           stage = case when stage in ('orbit', 'cold_dm', 'nurture', 'v2_closed_lost') then 'warm' else stage end,
           closed_at = case when pipeline_stage in ('orbit', 'closed_lost') then null else closed_at end,
           archived_at = null,
           archived_reason = null,
           updated_at = now()
     where id = opp_id
       and (pipeline_stage is null or pipeline_stage <> 'closed_won')
       and (archived_at is not null or pipeline_stage is null
            or pipeline_stage in ('prospect', 'orbit', 'closed_lost'));
    if new.crm_opportunity_id is distinct from opp_id then
      update outreach_prospects set crm_opportunity_id = opp_id where id = new.id;
    end if;
    return new;
  end if;

  insert into crm_opportunities (name, stage, pipeline_stage, source, tg_handle, owner_id, notes)
  values (
    coalesce(nullif(btrim(new.company), ''), new.telegram, 'Untitled'),
    'warm',
    'new_lead',
    'cold_outbound',
    new.telegram,
    new.owner_user_id,
    'Created from TG Outreach on reaching ' || new.status || '.'
  )
  returning id into opp_id;

  update outreach_prospects set crm_opportunity_id = opp_id where id = new.id;
  return new;
end;
$fn$;
