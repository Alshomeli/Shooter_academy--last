import { supabase } from '@/lib/supabase';

export type AIOperation =
  | 'approve_registration'
  | 'review_registration'
  | 'record_subscription_payment'
  | 'record_attendance'
  | 'publish_player_evaluation';

export interface PreparedAIAction {
  requestId: string;
  operation: AIOperation;
  preview: Record<string, unknown>;
  status: 'pending';
  requiresConfirmation: true;
  expiresAt: string;
}

export interface ExecutedAIAction {
  requestId: string;
  operation: AIOperation;
  status: 'executed';
  result: Record<string, unknown>;
}

async function invokeGateway<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-operations-gateway', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function prepareAIAction(
  operation: AIOperation,
  params: Record<string, unknown>,
): Promise<PreparedAIAction> {
  return invokeGateway<PreparedAIAction>({ mode: 'prepare', operation, params });
}

export function executeAIAction(requestId: string): Promise<ExecutedAIAction> {
  return invokeGateway<ExecutedAIAction>({ mode: 'execute', requestId, confirm: true });
}

export function cancelAIAction(requestId: string): Promise<{ requestId: string; status: 'cancelled' }> {
  return invokeGateway({ mode: 'cancel', requestId });
}
