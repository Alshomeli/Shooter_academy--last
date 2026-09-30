import { supabase } from '@/lib/supabase';
import { collectionChanges, type Row } from '@/lib/collection-diff';
import type {
  Staff, Team, Player, Parent, Subscription, Attendance,
  Match, Training, Transaction, Tournament, PlayerEvaluation,
  Settings, AuditLog, Notification, Lang, CurrentUser,
} from '@/types';
import {
  mapStaff, mapTeam, mapPlayer, mapParent, mapSubscription, mapAttendance,
  mapMatch, mapTraining, mapTransaction, mapTournament, mapEvaluation,
  mapSettings, mapAuditLog, mapNotification,
  staffToRow, teamToRow, playerToRow, parentToRow, subscriptionToRow,
  attendanceToRow, matchToRow, trainingToRow, transactionToRow,
  tournamentToRow, settingsToRow, notificationToRow,
} from '@/lib/db-mappers';


/* ---------- Preferences (still localStorage, no session data) ---------- */

const PREFIX = 'shooter_';

export const prefs = {
  getLang: (): Lang => (localStorage.getItem(PREFIX + 'lang') as Lang) || 'ar',
  saveLang: (v: Lang) => localStorage.setItem(PREFIX + 'lang', v),
  getDarkMode: (): boolean => localStorage.getItem(PREFIX + 'dark_mode') === 'true',
  saveDarkMode: (v: boolean) => localStorage.setItem(PREFIX + 'dark_mode', String(v)),
};

/* ---------- Auth ---------- */

let _registering = false;
export function setRegistering(v: boolean) { _registering = v; }
export function isRegistering() { return _registering; }

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string, redirectView?: 'registration' | 'staff-registration') {
  const redirect = new URL(window.location.origin + window.location.pathname);
  if (redirectView) redirect.searchParams.set('view', redirectView);
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirect.toString(),
      data: { onboarding_mode: redirectView === 'staff-registration' ? 'staff' : 'parent' },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/* ---------- Generic helpers ---------- */

async function fetchAll<T>(table: string, mapper: (r: Record<string, unknown>) => T): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return (data || []).map(r => ({ ...mapper(r), version: Number(r.row_version) }));
}

const TABLE_PUBLIC_COLUMNS: Record<string, string> = {
  staff: 'row_version,id,name,email,phone,role,specialization,status,joined_date,avatar_url,licenses,experience_years,rating,tactical_style,notes,user_id,created_at',
  parents: 'row_version,user_id,id,name,nationality,phone,whatsapp_phone,email,address,occupation,workplace,avatar_url,status,notes,joined_date,created_at',
  players: 'row_version,id,name,birth_date,blood_type,jersey_number,position,team_id,parent_name,parent_phone,parent_email,parent_id,status,joined_date,created_at',
};

async function upsertRow<T>(table: string, row: Record<string, unknown>, mapper: (r: Record<string, unknown>) => T): Promise<T> {
  const columns = TABLE_PUBLIC_COLUMNS[table] || '*';
  const { data, error } = await supabase.from(table).upsert(row).select(columns).single();
  if (error) throw error;
  return mapper(data as unknown as Record<string, unknown>);
}

/* Salary and national id are not readable through the table; managers read them
   through a privileged function and we merge them back in. */

async function fetchStaffRows(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from('staff').select(TABLE_PUBLIC_COLUMNS.staff);
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const { data: privateRows, error: privateError } = await supabase.rpc('get_staff_private');
  if (privateError) throw privateError;
  const byId = new Map<string, { salary?: number; national_id?: string | null }>();
  for (const p of (privateRows || []) as { id: string; salary: number; national_id: string | null }[]) {
    byId.set(p.id, { salary: Number(p.salary) || 0, national_id: p.national_id });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return { ...r, private_fields_loaded: !!priv, salary: priv?.salary ?? 0, national_id: priv?.national_id ?? null };
  });
}


async function fetchParentRows(): Promise<Parent[]> {
  const { data, error } = await supabase.from('parents').select(TABLE_PUBLIC_COLUMNS.parents);
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const { data: privateRows, error: privateError } = await supabase.rpc('get_parent_private');
  if (privateError) throw privateError;
  const byId = new Map<string, { national_id?: string | null }>();
  for (const p of (privateRows || []) as { id: string; national_id: string | null }[]) {
    byId.set(p.id, { national_id: p.national_id });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return (mapParent as never as (x: Record<string, unknown>) => Parent)({ ...r, private_fields_loaded: !!priv, national_id: priv?.national_id ?? null });
  });
}

async function fetchPlayerRows(): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select(TABLE_PUBLIC_COLUMNS.players);
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const { data: privateRows, error: privateError } = await supabase.rpc('get_player_private');
  if (privateError) throw privateError;
  const byId = new Map<string, { notes?: string | null }>();
  for (const p of (privateRows || []) as { id: string; notes: string | null }[]) {
    byId.set(p.id, { notes: p.notes });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return (mapPlayer as never as (x: Record<string, unknown>) => Player)({ ...r, private_fields_loaded: !!priv, notes: priv?.notes ?? '' });
  });
}

async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function syncTable<T extends { id: string; version?: number }>(
  table: string, items: T[], previous: T[], toRowFn: (item: T) => Record<string, unknown>,
): Promise<void> {
  const changes = collectionChanges(previous, items, i => toRowFn(i) as Row);
  for (const change of changes) {
    if (change.kind === 'insert') {
      const { error } = await supabase.from(table).insert(change.row);
      if (error) throw error;
      continue;
    }
    const mutation = change.kind === 'delete'
      ? supabase.from(table).delete()
      : supabase.from(table).update(change.patch);
    const { data, error } = await mutation.eq('id', change.id)
      .eq('row_version', change.version).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('STALE_RECORD');
  }
}

/* ---------- Staff ---------- */

export const db = {
  async getCurrentUser(): Promise<CurrentUser | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) return null;
    const { data: staff, error: staffError } = await supabase.from('staff')
      .select('id,name,email,role,status').eq('user_id', user.id).maybeSingle();
    if (staffError) throw staffError;
    if (staff?.status === 'active') return { ...staff, authUserId: user.id } as CurrentUser;
    const { data: parent, error: parentError } = await supabase.from('parents')
      .select('id,name,email,status').eq('user_id', user.id).maybeSingle();
    if (parentError) throw parentError;
    if (parent?.status === 'active') return { ...parent, role: 'parent', authUserId: user.id };

    const { data: staffApplication, error: staffApplicationError } = await supabase.from('staff_applications')
      .select('requested_role,full_name,email,status')
      .eq('applicant_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (staffApplicationError && staffApplicationError.code !== '42P01') throw staffApplicationError;
    if (staffApplication) {
      return {
        id: user.id,
        authUserId: user.id,
        name: staffApplication.full_name || user.email || '',
        email: staffApplication.email || user.email || '',
        role: staffApplication.requested_role as CurrentUser['role'],
        registrationOnly: true,
        registrationMode: 'staff',
      };
    }

    const onboardingMode = user.user_metadata?.onboarding_mode === 'staff' ? 'staff' : 'parent';
    return {
      id: user.id,
      authUserId: user.id,
      name: user.email || '',
      email: user.email || '',
      role: onboardingMode === 'staff' ? 'coach' : 'parent',
      registrationOnly: true,
      registrationMode: onboardingMode,
    };
  },

  async recordPayment(subscription: Subscription, method: string): Promise<Transaction> {
    const { data, error } = await supabase.rpc('record_subscription_payment', {
      p_subscription_id: subscription.id, p_amount: subscription.amount,
      p_payment_method: method,
    });
    if (error) throw error;
    return mapTransaction(data);
  },

  async getStaff(): Promise<Staff[]> {
    const rows = await fetchStaffRows();
    return rows.map((r) => (mapStaff as never as (x: Record<string, unknown>) => Staff)(r));
  },
  async saveStaff(s: Staff): Promise<Staff> { return upsertRow('staff', staffToRow(s) as unknown as Record<string, unknown>, mapStaff as never); },
  async deleteStaff(id: string, reassignCoachId?: string | null): Promise<void> {
    const { error } = await supabase.rpc('delete_staff_member_safely', { p_staff_id: id, p_reassign_coach_id: reassignCoachId ?? null });
    if (error) throw error;
  },

  async getTeams(): Promise<Team[]> { return fetchAll('teams', mapTeam as never); },
  async saveTeam(t: Team): Promise<Team> { return upsertRow('teams', teamToRow(t) as unknown as Record<string, unknown>, mapTeam as never); },
  async deleteTeam(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_team_safely', { p_team_id: id });
    if (error) throw error;
  },

  async getPlayers(): Promise<Player[]> { return fetchPlayerRows(); },
  async savePlayer(p: Player): Promise<Player> { return upsertRow('players', playerToRow(p) as unknown as Record<string, unknown>, mapPlayer as never); },
  async deletePlayer(id: string): Promise<void> { return deleteRow('players', id); },

  async getParents(): Promise<Parent[]> { return fetchParentRows(); },
  async saveParent(p: Parent): Promise<Parent> { return upsertRow('parents', parentToRow(p) as unknown as Record<string, unknown>, mapParent as never); },
  async deleteParent(id: string): Promise<void> { return deleteRow('parents', id); },

  async getSubscriptions(): Promise<Subscription[]> { return fetchAll('subscriptions', mapSubscription as never); },
  async saveSubscription(s: Subscription): Promise<Subscription> { return upsertRow('subscriptions', subscriptionToRow(s) as unknown as Record<string, unknown>, mapSubscription as never); },
  async deleteSubscription(id: string): Promise<void> { return deleteRow('subscriptions', id); },

  async getAttendance(): Promise<Attendance[]> { return fetchAll('attendance', mapAttendance as never); },
  async saveAttendance(a: Attendance): Promise<Attendance> { return upsertRow('attendance', attendanceToRow(a) as unknown as Record<string, unknown>, mapAttendance as never); },
  async deleteAttendance(id: string): Promise<void> { return deleteRow('attendance', id); },

  async getMatches(): Promise<Match[]> { return fetchAll('matches', mapMatch as never); },
  async saveMatch(m: Match): Promise<Match> { return upsertRow('matches', matchToRow(m) as unknown as Record<string, unknown>, mapMatch as never); },
  async deleteMatch(id: string): Promise<void> { return deleteRow('matches', id); },

  async getTrainings(): Promise<Training[]> { return fetchAll('trainings', mapTraining as never); },
  async saveTraining(t: Training): Promise<Training> { return upsertRow('trainings', trainingToRow(t) as unknown as Record<string, unknown>, mapTraining as never); },
  async deleteTraining(id: string): Promise<void> { return deleteRow('trainings', id); },

  async getTransactions(): Promise<Transaction[]> { return fetchAll('transactions', mapTransaction as never); },
  async saveTransaction(t: Transaction): Promise<Transaction> { return upsertRow('transactions', transactionToRow(t) as unknown as Record<string, unknown>, mapTransaction as never); },
  async deleteTransaction(id: string): Promise<void> { return deleteRow('transactions', id); },

  async getTournaments(): Promise<Tournament[]> { return fetchAll('tournaments', mapTournament as never); },
  async saveTournament(t: Tournament): Promise<Tournament> { return upsertRow('tournaments', tournamentToRow(t) as unknown as Record<string, unknown>, mapTournament as never); },
  async deleteTournament(id: string): Promise<void> { return deleteRow('tournaments', id); },

  async getEvaluations(): Promise<PlayerEvaluation[]> {
    const { data, error } = await supabase.from('player_evaluations').select('*');
    if (error) throw error;
    return (data || []).map(r => mapEvaluation(r as never));
  },
  async savePlayerEvaluation(ev: { id?: string; playerId: string; evaluationDate: string; periodType: string; technicalScore: number | null; tacticalScore: number | null; physicalScore: number | null; mentalScore: number | null; disciplineScore: number | null; strengths: string; developmentAreas: string; coachNotes: string; coachRecommendation: string; detailedScores: Record<string, number | null>; developmentPriorities: string[]; trainingAction: string; reassessmentDate: string | null; finalRecommendation: string }): Promise<string> {
    const { data, error } = await supabase.rpc('save_player_evaluation_v2', {
      p_evaluation_id: ev.id ?? null, p_player_id: ev.playerId,
      p_evaluation_date: ev.evaluationDate, p_period_type: ev.periodType,
      p_technical_score: ev.technicalScore, p_tactical_score: ev.tacticalScore,
      p_physical_score: ev.physicalScore, p_mental_score: ev.mentalScore,
      p_discipline_score: ev.disciplineScore, p_strengths: ev.strengths || null,
      p_development_areas: ev.developmentAreas || null,
      p_coach_notes: ev.coachNotes || null, p_coach_recommendation: ev.coachRecommendation || null,
      p_detailed_scores: ev.detailedScores || {}, p_development_priorities: ev.developmentPriorities || [],
      p_training_action: ev.trainingAction || null, p_reassessment_date: ev.reassessmentDate || null,
      p_final_recommendation: ev.finalRecommendation || null,
    });
    if (error) throw error;
    return data as string;
  },
  async publishPlayerEvaluation(evaluationId: string): Promise<PlayerEvaluation> {
    const { data, error } = await supabase.rpc('publish_player_evaluation', { p_evaluation_id: evaluationId });
    if (error) throw error;
    return mapEvaluation(data as never);
  },

  async getSettings(): Promise<Settings | null> {
    const { data, error } = await supabase.from('academy_settings').select('*').eq('id', 'settings-1').maybeSingle();
    if (error) throw error;
    return data ? mapSettings(data as never) : null;
  },
  async saveSettings(s: Settings): Promise<void> {
    if (s.version === undefined) throw new Error('Reload settings before editing');
    const { data, error } = await supabase.from('academy_settings').update(settingsToRow(s))
      .eq('id', s.id).eq('row_version', s.version).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('STALE_RECORD');
  },

  async getAuditLogs(): Promise<AuditLog[]> { return fetchAll('audit_logs', mapAuditLog as never); },
  async addAuditLog(a: AuditLog): Promise<void> {
    const { error } = await supabase.rpc('record_audit_log', { p_action: a.action, p_details: a.details });
    if (error) throw error;
  },

  async getLoginAuditLogs(): Promise<AuditLog[]> { return fetchAll('login_audit_logs', mapAuditLog as never); },
  async addLoginAuditLog(a: AuditLog): Promise<void> {
    const { error } = await supabase.rpc('record_login_audit_log', { p_action: a.action, p_details: a.details });
    if (error) throw error;
  },

  async getNotifications(): Promise<Notification[]> { return fetchAll('notifications', mapNotification as never); },
  async saveNotification(n: Notification): Promise<Notification> { return upsertRow('notifications', notificationToRow(n) as unknown as Record<string, unknown>, mapNotification as never); },
  async deleteNotification(id: string): Promise<void> { return deleteRow('notifications', id); },

  /* ---------- Explicit changes against the displayed snapshot ---------- */

  async syncStaff(items: Staff[], previous: Staff[]): Promise<void> { return syncTable('staff', items, previous, (i) => staffToRow(i) as unknown as Record<string, unknown>); },
  async syncTeams(items: Team[], previous: Team[]): Promise<void> { return syncTable('teams', items, previous, (i) => teamToRow(i) as unknown as Record<string, unknown>); },
  async syncPlayers(items: Player[], previous: Player[]): Promise<void> { return syncTable('players', items, previous, (i) => playerToRow(i) as unknown as Record<string, unknown>); },
  async syncParents(items: Parent[], previous: Parent[]): Promise<void> { return syncTable('parents', items, previous, (i) => parentToRow(i) as unknown as Record<string, unknown>); },
  async syncSubscriptions(items: Subscription[], previous: Subscription[]): Promise<void> { return syncTable('subscriptions', items, previous, (i) => subscriptionToRow(i) as unknown as Record<string, unknown>); },
  async syncAttendance(items: Attendance[], previous: Attendance[]): Promise<void> { return syncTable('attendance', items, previous, (i) => attendanceToRow(i) as unknown as Record<string, unknown>); },
  async syncMatches(items: Match[], previous: Match[]): Promise<void> { return syncTable('matches', items, previous, (i) => matchToRow(i) as unknown as Record<string, unknown>); },
  async syncTrainings(items: Training[], previous: Training[]): Promise<void> { return syncTable('trainings', items, previous, (i) => trainingToRow(i) as unknown as Record<string, unknown>); },
  async syncTransactions(items: Transaction[], previous: Transaction[]): Promise<void> { return syncTable('transactions', items, previous, (i) => transactionToRow(i) as unknown as Record<string, unknown>); },
  async syncTournaments(items: Tournament[], previous: Tournament[]): Promise<void> { return syncTable('tournaments', items, previous, (i) => tournamentToRow(i) as unknown as Record<string, unknown>); },

  async syncNotifications(items: Notification[], previous: Notification[]): Promise<void> { return syncTable('notifications', items, previous, (i) => notificationToRow(i) as unknown as Record<string, unknown>); },

  /* ---------- Real-time subscriptions ---------- */

  subscribe(table: string, onChange: () => void) {
    return supabase
      .channel(`changes_${table}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
      .subscribe();
  },
};
