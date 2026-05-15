import { supabase } from './supabase';

/**
 * Service for kol_call_logs (table created in migration 071).
 *
 * One row per call with a KOL — onboarding, repeat onboarding, or
 * check-in. Quazo / Andy fill these in after the call so we have a
 * paper trail of intel, recommended angles, and feedback.
 *
 * Reverse-chronological on the KOL profile view, per spec.
 */

export interface KolCallLog {
  id: string;
  kol_id: string;
  call_date: string;            // YYYY-MM-DD
  project: string | null;
  call_type: string | null;     // First Onboarding | Repeat Onboarding | Check-in
  notes: string | null;
  market_intel: string | null;
  recommended_angle: string | null;
  feedback_on_hh: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKolCallLogInput {
  kol_id: string;
  call_date: string;
  project?: string | null;
  call_type?: string | null;
  notes?: string | null;
  market_intel?: string | null;
  recommended_angle?: string | null;
  feedback_on_hh?: string | null;
}

export type UpdateKolCallLogInput = Partial<Omit<CreateKolCallLogInput, 'kol_id'>>;

export const CALL_TYPES = [
  'First Onboarding',
  'Repeat Onboarding',
  'Check-in',
] as const;

export class KolCallLogService {
  /**
   * All call log entries for a KOL — newest first.
   */
  static async getForKol(kolId: string): Promise<KolCallLog[]> {
    const { data, error } = await (supabase as any)
      .from('kol_call_logs')
      .select('*')
      .eq('kol_id', kolId)
      .order('call_date', { ascending: false });
    if (error) {
      console.error('[KolCallLogService.getForKol]', error);
      throw error;
    }
    return (data || []) as KolCallLog[];
  }

  static async create(input: CreateKolCallLogInput): Promise<KolCallLog> {
    const { data, error } = await (supabase as any)
      .from('kol_call_logs')
      .insert(input)
      .select('*')
      .single();
    if (error) {
      console.error('[KolCallLogService.create]', error);
      throw error;
    }
    return data as KolCallLog;
  }

  static async update(id: string, input: UpdateKolCallLogInput): Promise<KolCallLog> {
    const payload: Record<string, any> = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = await (supabase as any)
      .from('kol_call_logs')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[KolCallLogService.update]', error);
      throw error;
    }
    return data as KolCallLog;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('kol_call_logs')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[KolCallLogService.delete]', error);
      throw error;
    }
  }
}
