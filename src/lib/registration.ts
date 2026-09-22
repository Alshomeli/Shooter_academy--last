import { supabase } from '@/lib/supabase';
import type {
  RegistrationParentInput,
  RegistrationChildInput,
  RegistrationDraftResult,
  RegistrationApplication,
  RegistrationStatus,
} from '@/types';

/* ------------------------------------------------------------------ */
/*  Draft creation                                                     */
/* ------------------------------------------------------------------ */

export async function createDraft(
  parent: RegistrationParentInput,
  children: RegistrationChildInput[],
): Promise<RegistrationDraftResult> {
  const { data, error } = await supabase.rpc('create_registration_draft', {
    p_parent: parent as unknown as Record<string, unknown>,
    p_children: children as unknown as Record<string, unknown>[],
  });
  if (error) throw error;
  return data as unknown as RegistrationDraftResult;
}

/* ------------------------------------------------------------------ */
/*  Photo / document upload                                            */
/* ------------------------------------------------------------------ */

export async function uploadChildPhoto(
  applicationId: string,
  childId: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `applications/${applicationId}/${childId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('player-documents')
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (uploadErr) throw uploadErr;

  return path;
}

export async function registerDocument(
  applicationId: string,
  childId: string | null,
  storagePath: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
  fileCategory: 'photo' | 'document',
  documentType?: string,
): Promise<void> {
  const { error } = await supabase.rpc('add_registration_document', {
    p_application_id: applicationId,
    p_child_id: childId,
    p_storage_path: storagePath,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_category: fileCategory,
    p_document_type: documentType ?? null,
    p_file_size: fileSize,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Submit                                                             */
/* ------------------------------------------------------------------ */

export async function submitApplication(applicationId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_registration_application', {
    p_application_id: applicationId,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Manager actions                                                    */
/* ------------------------------------------------------------------ */

export async function reviewApplication(
  applicationId: string,
  status: 'under_review' | 'needs_info' | 'rejected',
  notes: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_registration_application', {
    p_application_id: applicationId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function approveApplication(applicationId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_registration_application', {
    p_application_id: applicationId,
  });
  if (error) throw error;
}

export async function finalizePlayer(
  playerId: string,
  teamId: string,
  position: string,
  jerseyNumber: number,
): Promise<void> {
  const { error } = await supabase.rpc('finalize_registered_player', {
    p_player_id: playerId,
    p_team_id: teamId,
    p_position: position,
    p_jersey_number: jerseyNumber,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Fetching applications                                              */
/* ------------------------------------------------------------------ */

export async function fetchMyApplications(): Promise<RegistrationApplication[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('registration_applications')
    .select('*, registration_children(*), registration_documents(*)')
    .eq('parent_user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapApplication);
}

export async function fetchAllApplications(): Promise<RegistrationApplication[]> {
  const { data, error } = await supabase
    .from('registration_applications')
    .select('*, registration_children(*), registration_documents(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapApplication);
}

export async function fetchApplicationById(id: string): Promise<RegistrationApplication | null> {
  const { data, error } = await supabase
    .from('registration_applications')
    .select('*, registration_children(*), registration_documents(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapApplication(data) : null;
}

export function getSignedUrl(storagePath: string): Promise<string | null> {
  return supabase.storage
    .from('player-documents')
    .createSignedUrl(storagePath, 3600)
    .then(({ data }) => data?.signedUrl ?? null);
}

/* ------------------------------------------------------------------ */
/*  Row mapper                                                         */
/* ------------------------------------------------------------------ */

function mapApplication(row: Record<string, unknown>): RegistrationApplication {
  const children = (row.registration_children as Record<string, unknown>[] || []).map((c) => ({
    id: String(c.id),
    fullName: String(c.full_name || ''),
    nationalId: c.national_id ? String(c.national_id) : undefined,
    birthDate: String(c.birth_date || ''),
    bloodType: c.blood_type ? String(c.blood_type) : undefined,
    notes: c.notes ? String(c.notes) : undefined,
    playerId: c.player_id ? String(c.player_id) : undefined,
  }));

  const documents = (row.registration_documents as Record<string, unknown>[] || []).map((d) => ({
    id: String(d.id),
    childId: d.child_id ? String(d.child_id) : undefined,
    storagePath: String(d.storage_path || ''),
    fileName: String(d.file_name || ''),
    mimeType: String(d.mime_type || ''),
    fileSize: Number(d.file_size) || 0,
    fileCategory: String(d.file_category || 'document') as 'photo' | 'document',
    documentType: d.document_type ? String(d.document_type) : undefined,
  }));

  return {
    id: String(row.id),
    registrationType: String(row.registration_type) as RegistrationApplication['registrationType'],
    status: String(row.status) as RegistrationStatus,
    parentName: String(row.parent_name || ''),
    parentNationalId: row.parent_national_id ? String(row.parent_national_id) : undefined,
    parentPhone: String(row.parent_phone || ''),
    parentEmail: String(row.parent_email || ''),
    parentWhatsapp: row.parent_whatsapp ? String(row.parent_whatsapp) : undefined,
    parentNationality: row.parent_nationality ? String(row.parent_nationality) : undefined,
    parentOccupation: row.parent_occupation ? String(row.parent_occupation) : undefined,
    parentWorkplace: row.parent_workplace ? String(row.parent_workplace) : undefined,
    parentAddress: row.parent_address ? String(row.parent_address) : undefined,
    parentNotes: row.parent_notes ? String(row.parent_notes) : undefined,
    children,
    documents,
    reviewNotes: row.review_notes ? String(row.review_notes) : undefined,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}
