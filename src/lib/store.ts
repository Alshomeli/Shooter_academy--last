import { supabase } from '@/lib/supabase';
import type {
  Staff, Team, Player, Parent, Subscription, Attendance,
  Match, Training, Transaction, Tournament, Video,
  Settings, AuditLog, Notification, Lang,
} from '@/types';
import {
  mapStaff, mapTeam, mapPlayer, mapParent, mapSubscription, mapAttendance,
  mapMatch, mapTraining, mapTransaction, mapTournament, mapVideo,
  mapSettings, mapAuditLog, mapNotification,
  staffToRow, teamToRow, playerToRow, parentToRow, subscriptionToRow,
  attendanceToRow, matchToRow, trainingToRow, transactionToRow,
  tournamentToRow, videoToRow, settingsToRow, auditLogToRow, notificationToRow,
} from '@/lib/db-mappers';
import {
  SEED_STAFF, SEED_TEAMS, SEED_PLAYERS, SEED_PARENTS, SEED_SUBSCRIPTIONS,
  SEED_ATTENDANCE, SEED_MATCHES, SEED_TRAINING, SEED_TRANSACTIONS,
  SEED_TOURNAMENTS, SEED_VIDEOS, SEED_SETTINGS, SEED_AUDIT_LOGS,
} from '@/data/seed';

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

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/* ---------- Generic helpers ---------- */

async function fetchAll<T>(table: string, mapper: (r: Record<string, unknown>) => T): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return (data || []).map(mapper);
}

const TABLE_PUBLIC_COLUMNS: Record<string, string> = {
  staff: 'id,name,email,phone,role,specialization,status,joined_date,avatar_url,licenses,experience_years,rating,tactical_style,notes,user_id,created_at',
  parents: 'id,name,nationality,phone,whatsapp_phone,email,address,occupation,workplace,avatar_url,status,notes,joined_date,created_at',
  players: 'id,name,birth_date,blood_type,jersey_number,position,team_id,parent_name,parent_phone,parent_email,parent_id,status,joined_date,created_at',
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
  const rows = (data || []) as Record<string, unknown>[];
  const { data: privateRows } = await supabase.rpc('get_staff_private');
  const byId = new Map<string, { salary?: number; national_id?: string | null }>();
  for (const p of (privateRows || []) as { id: string; salary: number; national_id: string | null }[]) {
    byId.set(p.id, { salary: Number(p.salary) || 0, national_id: p.national_id });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return { ...r, salary: priv?.salary ?? 0, national_id: priv?.national_id ?? null };
  });
}


async function fetchParentRows(): Promise<Parent[]> {
  const { data, error } = await supabase.from('parents').select(TABLE_PUBLIC_COLUMNS.parents);
  if (error) throw error;
  const rows = (data || []) as Record<string, unknown>[];
  const { data: privateRows } = await supabase.rpc('get_parent_private');
  const byId = new Map<string, { national_id?: string | null }>();
  for (const p of (privateRows || []) as { id: string; national_id: string | null }[]) {
    byId.set(p.id, { national_id: p.national_id });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return (mapParent as never as (x: Record<string, unknown>) => Parent)({ ...r, national_id: priv?.national_id ?? null });
  });
}

async function fetchPlayerRows(): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select(TABLE_PUBLIC_COLUMNS.players);
  if (error) throw error;
  const rows = (data || []) as Record<string, unknown>[];
  const { data: privateRows } = await supabase.rpc('get_player_private');
  const byId = new Map<string, { notes?: string | null }>();
  for (const p of (privateRows || []) as { id: string; notes: string | null }[]) {
    byId.set(p.id, { notes: p.notes });
  }
  return rows.map((r) => {
    const priv = byId.get(String(r.id));
    return (mapPlayer as never as (x: Record<string, unknown>) => Player)({ ...r, notes: priv?.notes ?? '' });
  });
}

async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function syncTable<T extends { id: string }>(
  table: string,
  items: T[],
  toRowFn: (item: T) => Record<string, unknown>,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase.from(table).select('id');
  if (selErr) throw selErr;
  const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
  const newIds = new Set(items.map((i) => i.id));
  if (items.length > 0) {
    const { error: upsertErr } = await supabase.from(table).upsert(items.map(toRowFn));
    if (upsertErr) throw upsertErr;
  }
  const toDelete = [...existingIds].filter((id) => !newIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from(table).delete().in('id', toDelete);
    if (delErr) throw delErr;
  }
}

/* ---------- Staff ---------- */

export const db = {
  async getStaff(): Promise<Staff[]> {
    const rows = await fetchStaffRows();
    return rows.map((r) => (mapStaff as never as (x: Record<string, unknown>) => Staff)(r));
  },
  async saveStaff(s: Staff): Promise<Staff> { return upsertRow('staff', staffToRow(s) as unknown as Record<string, unknown>, mapStaff as never); },
  async deleteStaff(id: string): Promise<void> { return deleteRow('staff', id); },

  async getTeams(): Promise<Team[]> { return fetchAll('teams', mapTeam as never); },
  async saveTeam(t: Team): Promise<Team> { return upsertRow('teams', teamToRow(t) as unknown as Record<string, unknown>, mapTeam as never); },
  async deleteTeam(id: string): Promise<void> { return deleteRow('teams', id); },

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

  async getVideos(): Promise<Video[]> { return fetchAll('videos', mapVideo as never); },
  async saveVideo(v: Video): Promise<Video> { return upsertRow('videos', videoToRow(v) as unknown as Record<string, unknown>, mapVideo as never); },
  async deleteVideo(id: string): Promise<void> { return deleteRow('videos', id); },

  async getSettings(): Promise<Settings | null> {
    const { data, error } = await supabase.from('academy_settings').select('*').eq('id', 'settings-1').maybeSingle();
    if (error) throw error;
    return data ? mapSettings(data as never) : null;
  },
  async saveSettings(s: Settings): Promise<Settings> { return upsertRow('academy_settings', settingsToRow(s) as unknown as Record<string, unknown>, mapSettings as never); },

  async getAuditLogs(): Promise<AuditLog[]> { return fetchAll('audit_logs', mapAuditLog as never); },
  async addAuditLog(a: AuditLog): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert(auditLogToRow(a) as unknown as Record<string, unknown>);
    if (error) throw error;
  },

  async getLoginAuditLogs(): Promise<AuditLog[]> { return fetchAll('login_audit_logs', mapAuditLog as never); },
  async addLoginAuditLog(a: AuditLog): Promise<void> {
    const { error } = await supabase.from('login_audit_logs').insert(auditLogToRow(a) as unknown as Record<string, unknown>);
    if (error) throw error;
  },

  async getNotifications(): Promise<Notification[]> { return fetchAll('notifications', mapNotification as never); },
  async saveNotification(n: Notification): Promise<Notification> { return upsertRow('notifications', notificationToRow(n) as unknown as Record<string, unknown>, mapNotification as never); },
  async deleteNotification(id: string): Promise<void> { return deleteRow('notifications', id); },

  /* ---------- Batch sync (upsert + delete missing) ---------- */

  async syncStaff(items: Staff[]): Promise<void> { return syncTable('staff', items, (i) => staffToRow(i) as unknown as Record<string, unknown>); },
  async syncTeams(items: Team[]): Promise<void> { return syncTable('teams', items, (i) => teamToRow(i) as unknown as Record<string, unknown>); },
  async syncPlayers(items: Player[]): Promise<void> { return syncTable('players', items, (i) => playerToRow(i) as unknown as Record<string, unknown>); },
  async syncParents(items: Parent[]): Promise<void> { return syncTable('parents', items, (i) => parentToRow(i) as unknown as Record<string, unknown>); },
  async syncSubscriptions(items: Subscription[]): Promise<void> { return syncTable('subscriptions', items, (i) => subscriptionToRow(i) as unknown as Record<string, unknown>); },
  async syncAttendance(items: Attendance[]): Promise<void> { return syncTable('attendance', items, (i) => attendanceToRow(i) as unknown as Record<string, unknown>); },
  async syncMatches(items: Match[]): Promise<void> { return syncTable('matches', items, (i) => matchToRow(i) as unknown as Record<string, unknown>); },
  async syncTrainings(items: Training[]): Promise<void> { return syncTable('trainings', items, (i) => trainingToRow(i) as unknown as Record<string, unknown>); },
  async syncTransactions(items: Transaction[]): Promise<void> { return syncTable('transactions', items, (i) => transactionToRow(i) as unknown as Record<string, unknown>); },
  async syncTournaments(items: Tournament[]): Promise<void> { return syncTable('tournaments', items, (i) => tournamentToRow(i) as unknown as Record<string, unknown>); },
  async syncVideos(items: Video[]): Promise<void> { return syncTable('videos', items, (i) => videoToRow(i) as unknown as Record<string, unknown>); },
  async syncNotifications(items: Notification[]): Promise<void> { return syncTable('notifications', items, (i) => notificationToRow(i) as unknown as Record<string, unknown>); },

  /* ---------- Real-time subscriptions ---------- */

  subscribe(table: string, onChange: () => void) {
    return supabase
      .channel(`changes_${table}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
      .subscribe();
  },
};

/* ---------- Seeding + auth user provisioning (via edge function) ---------- */

function buildSeedPayload(): Record<string, unknown[]> {
  return {
    staff: SEED_STAFF.map(staffToRow) as unknown as Record<string, unknown>[],
    teams: SEED_TEAMS.map(teamToRow) as unknown as Record<string, unknown>[],
    players: SEED_PLAYERS.map(playerToRow) as unknown as Record<string, unknown>[],
    parents: SEED_PARENTS.map(parentToRow) as unknown as Record<string, unknown>[],
    subscriptions: SEED_SUBSCRIPTIONS.map(subscriptionToRow) as unknown as Record<string, unknown>[],
    attendance: SEED_ATTENDANCE.map(attendanceToRow) as unknown as Record<string, unknown>[],
    matches: SEED_MATCHES.map(matchToRow) as unknown as Record<string, unknown>[],
    trainings: SEED_TRAINING.map(trainingToRow) as unknown as Record<string, unknown>[],
    transactions: SEED_TRANSACTIONS.map(transactionToRow) as unknown as Record<string, unknown>[],
    tournaments: SEED_TOURNAMENTS.map(tournamentToRow) as unknown as Record<string, unknown>[],
    videos: SEED_VIDEOS.map(videoToRow) as unknown as Record<string, unknown>[],
    audit_logs: SEED_AUDIT_LOGS.map(auditLogToRow) as unknown as Record<string, unknown>[],
    academy_settings: [settingsToRow(SEED_SETTINGS) as unknown as Record<string, unknown>],
  };
}

async function callSetupEndpoint(payload: Record<string, unknown>): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('يجب تسجيل الدخول لإعداد البيانات');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-academy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(detail.error || `Setup failed (${res.status})`);
  }
}

export async function seedDatabaseIfEmpty(): Promise<void> {
  const { count, error } = await supabase.from('staff').select('id', { count: 'exact', head: true });
  if (error) throw error;
  if (count && count > 0) return;
  await callSetupEndpoint(buildSeedPayload());
}

export async function resetAndSeedDatabase(): Promise<void> {
  await callSetupEndpoint({ ...buildSeedPayload(), reset: true, confirm_reset: true, createUsers: true });
}
