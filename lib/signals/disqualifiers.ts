/**
 * Signal & Trigger Bible v3 — Disqualification Rules
 * If ANY disqualifier is true, the prospect should be removed from active targeting.
 */

export interface DisqualificationResult {
  disqualified: boolean;
  reason: string | null;
}

interface ProspectData {
  id: string;
  name: string;
  status: string;
  telegram_users?: number | null;
}

interface SignalData {
  signal_type: string;
  is_active: boolean;
}

interface CRMData {
  bump_count?: number | null;
  stage?: string | null;
  notes?: string | null;
}

/**
 * Check all 6 Bible v3 disqualification rules.
 */
export function checkDisqualifiers(
  prospect: ProspectData,
  signals: SignalData[],
  crmData?: CRMData | null,
): DisqualificationResult {
  const activeSignals = signals.filter(s => s.is_active);
  const signalTypes = new Set(activeSignals.map(s => s.signal_type));

  // 1. Building Korea ops in-house
  // korea_hiring/korea_job_posting signal + confirmed (manual flag via notes or status)
  if (
    (signalTypes.has('korea_hiring') || signalTypes.has('korea_job_posting')) &&
    crmData?.notes?.toLowerCase().includes('in-house')
  ) {
    return { disqualified: true, reason: 'Building Korea ops in-house (confirmed Korea hire + in-house note)' };
  }

  // 2. Korean community >10K active
  if (prospect.telegram_users && prospect.telegram_users > 10000) {
    return { disqualified: true, reason: `Korean community already large (${prospect.telegram_users.toLocaleString()} TG users)` };
  }

  // 3. On DNC list (checked via status or notes)
  if (crmData?.notes?.toLowerCase().includes('dnc') || crmData?.notes?.toLowerCase().includes('do not contact')) {
    return { disqualified: true, reason: 'On DNC (Do Not Contact) list' };
  }

  // 4. Project shut down / rugged
  if (signalTypes.has('korea_scam_alert')) {
    return { disqualified: true, reason: 'Scam/fraud alert detected in Korean media' };
  }

  // 5. Under regulatory action
  if (signalTypes.has('korea_regulatory_warning')) {
    // Only disqualify if multiple regulatory signals (one warning might be resolved)
    const regWarnings = activeSignals.filter(s => s.signal_type === 'korea_regulatory_warning').length;
    if (regWarnings >= 2) {
      return { disqualified: true, reason: 'Multiple regulatory warnings (FSC/FIU)' };
    }
  }

  // 6. Already has competent Korea agency
  if (signalTypes.has('korea_agency_present')) {
    return { disqualified: true, reason: 'Already has a Korean marketing agency' };
  }

  return { disqualified: false, reason: null };
}
