import { supabase } from '@/lib/supabase';

export interface RegistrationDocument {
  id: string; child_id: string | null; application_id: string; storage_path: string;
  file_name: string; mime_type: string; file_category: 'photo' | 'document';
}
export interface RegistrationChild {
  id: string; application_id: string; client_key: string | null; full_name: string; national_id: string;
  birth_date: string; blood_type: string | null; parent_notes: string | null; approved_player_id: string | null;
}
export interface RegistrationApplication {
  id: string; status: 'draft' | 'pending' | 'under_review' | 'needs_info' | 'approved' | 'rejected';
  parent_full_name: string; parent_national_id: string; parent_phone: string; parent_email: string;
  parent_whatsapp: string | null; parent_nationality: string | null; parent_occupation: string | null;
  parent_workplace: string | null; parent_address: string | null; parent_notes: string | null;
  review_notes: string | null; created_at: string; children: RegistrationChild[]; documents: RegistrationDocument[];
}
export async function getApplications(): Promise<RegistrationApplication[]> {
  const [apps, children, documents] = await Promise.all([
    supabase.from('registration_applications').select('*').order('created_at', { ascending: false }),
    supabase.from('registration_children').select('*').order('created_at'),
    supabase.from('registration_documents').select('*'),
  ]);
  if (apps.error) throw apps.error;
  if (children.error) throw children.error;
  if (documents.error) throw documents.error;
  return (apps.data || []).map(app => ({ ...app,
    children: (children.data || []).filter(child => child.application_id === app.id),
    documents: (documents.data || []).filter(doc => doc.application_id === app.id),
  })) as RegistrationApplication[];
}
export async function registrationRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export function registrationStatus(status: RegistrationApplication['status'], ar: boolean) {
  const labels = { draft: ['مسودة', 'Draft'], pending: ['بانتظار المراجعة', 'Pending review'],
    under_review: ['قيد المراجعة', 'Under review'], needs_info: ['مطلوب استكمال البيانات', 'More information needed'],
    approved: ['مقبول', 'Approved'], rejected: ['مرفوض', 'Rejected'] };
  return labels[status][ar ? 0 : 1];
}
export function errorMessage(error: unknown, ar: boolean) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return `${ar ? 'تعذر إتمام العملية.' : 'Unable to complete this action.'} ${message}`;
}
