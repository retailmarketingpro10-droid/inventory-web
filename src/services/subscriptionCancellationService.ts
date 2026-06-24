import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { openSupportEmail } from '@/lib/supportEmail';

export async function requestSubscriptionCancellation(params: {
  subscriptionId: string;
  userId: string;
  userEmail?: string;
  reason?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const noteLine = `Cancellation requested via web on ${new Date().toLocaleString('en-IN')}${params.reason ? `: ${params.reason}` : ''}`;

  const { data: existing, error: fetchError } = await (supabase as any)
    .from('subscriptions')
    .select('notes')
    .eq('id', params.subscriptionId)
    .eq('user_id', params.userId)
    .single();

  if (fetchError) {
    logger.error('requestSubscriptionCancellation: fetch', fetchError);
    throw fetchError;
  }

  const priorNotes = existing?.notes ? `${existing.notes}\n` : '';
  const { error: updateError } = await (supabase as any)
    .from('subscriptions')
    .update({
      cancellation_requested_at: now,
      cancellation_reason: params.reason || null,
      notes: `${priorNotes}${noteLine}`,
      updated_at: now,
    })
    .eq('id', params.subscriptionId)
    .eq('user_id', params.userId);

  if (updateError) {
    logger.error('requestSubscriptionCancellation: update', updateError);
    throw updateError;
  }

  openSupportEmail('cancellation', {
    userId: params.userId,
    userEmail: params.userEmail,
    extraBody: params.reason?.trim() || undefined,
  });
}
