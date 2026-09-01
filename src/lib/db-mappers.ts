import type {
  Staff, Team, Player, Parent, Subscription, Attendance,
  Match, Training, Transaction, Tournament, Video, VideoMarker,
  Settings, AuditLog, Notification,
} from '@/types';

/* ---------- Row types (snake_case from Postgres) ---------- */

interface StaffRow {
  id: string; name: string; email: string; phone: string; role: string;
  salary: number; specialization: string; status: string; joined_date: string;
  avatar_url: string; national_id: string | null; licenses: string[] | null;
  experience_years: number | null; rating: number | null;
  tactical_style: string | null; notes: string | null; user_id: string | null;
}
interface TeamRow {
  id: string; name: string; age_group: string; coach_id: string;
  training_days: string[]; training_time: string; pitch_number: string;
}
interface PlayerRow {
  id: string; name: string; birth_date: string; blood_type: string;
  jersey_number: number; position: string; team_id: string;
  parent_name: string; parent_phone: string; parent_email: string;
  parent_id: string; status: string; notes: string; joined_date: string;
}
interface ParentRow {
  id: string; name: string; national_id: string; nationality: string;
  phone: string; whatsapp_phone: string; email: string; address: string;
  occupation: string; workplace: string; avatar_url: string;
  status: string; notes: string; joined_date: string;
}
interface SubscriptionRow {
  id: string; player_id: string; plan_type: string; amount: number;
  start_date: string; end_date: string; status: string;
  payment_method: string | null; paid_at: string | null;
}
interface AttendanceRow {
  id: string; player_id: string; session_date: string;
  session_type: string; status: string; notes: string | null;
}
interface MatchRow {
  id: string; team_id: string; opponent: string; match_date: string;
  location: string; result: string; academy_score: number;
  opponent_score: number; scorers: string | null; notes: string | null;
}
interface TrainingRow {
  id: string; team_id: string; title: string; session_date: string;
  duration_minutes: number; objectives: string;
}
interface TransactionRow {
  id: string; type: string; category: string; amount: number;
  transaction_date: string; description: string; recorded_by: string;
}
interface TournamentRow {
  id: string; name: string; organizer: string; season: string;
  start_date: string; end_date: string; teams_count: number; logo_emoji: string;
}
interface VideoRow {
  id: string; title: string; video_url: string; associated_type: string;
  associated_id: string; notes: string; created_at: string;
  markers: VideoMarker[];
}
interface SettingsRow {
  id: string; name: string; logo_url: string; phone: string;
  email: string; address: string; subscription_fee_monthly: number;
  subscription_fee_quarterly: number; subscription_fee_yearly: number;
}
interface AuditLogRow {
  id: string; action: string; timestamp: string; user_role: string;
  user_name: string; details: string;
}
interface NotificationRow {
  id: string; title: string; message: string; timestamp: string;
  type: string; read: boolean;
}

/* ---------- Row -> domain (snake_case to camelCase) ---------- */

export const mapStaff = (r: StaffRow): Staff => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role as Staff['role'],
  salary: Number(r.salary) || 0, specialization: r.specialization, status: r.status as Staff['status'],
  joinedDate: r.joined_date, avatarUrl: r.avatar_url, nationalId: r.national_id ?? undefined,
  licenses: r.licenses ?? undefined, experienceYears: r.experience_years ?? undefined,
  rating: r.rating ?? undefined, tacticalStyle: r.tactical_style ?? undefined,
  notes: r.notes ?? undefined, userId: r.user_id ?? undefined,
});

export const mapTeam = (r: TeamRow): Team => ({
  id: r.id, name: r.name, ageGroup: r.age_group, coachId: r.coach_id,
  trainingDays: r.training_days ?? [], trainingTime: r.training_time, pitchNumber: r.pitch_number,
});

export const mapPlayer = (r: PlayerRow): Player => ({
  id: r.id, name: r.name, birthDate: r.birth_date, bloodType: r.blood_type,
  jerseyNumber: r.jersey_number, position: r.position, teamId: r.team_id,
  parentName: r.parent_name, parentPhone: r.parent_phone, parentEmail: r.parent_email,
  parentId: r.parent_id, status: r.status as Player['status'], notes: r.notes,
  joinedDate: r.joined_date,
});

export const mapParent = (r: ParentRow): Parent => ({
  id: r.id, name: r.name, nationalId: r.national_id, nationality: r.nationality,
  phone: r.phone, whatsappPhone: r.whatsapp_phone, email: r.email, address: r.address,
  occupation: r.occupation, workplace: r.workplace, avatarUrl: r.avatar_url,
  status: r.status as Parent['status'], notes: r.notes, joinedDate: r.joined_date,
});

export const mapSubscription = (r: SubscriptionRow): Subscription => ({
  id: r.id, playerId: r.player_id, planType: r.plan_type as Subscription['planType'],
  amount: r.amount, startDate: r.start_date, endDate: r.end_date,
  status: r.status as Subscription['status'], paymentMethod: r.payment_method ?? undefined,
  paidAt: r.paid_at ?? undefined,
});

export const mapAttendance = (r: AttendanceRow): Attendance => ({
  id: r.id, playerId: r.player_id, sessionDate: r.session_date,
  sessionType: r.session_type as Attendance['sessionType'],
  status: r.status as Attendance['status'], notes: r.notes ?? undefined,
});

export const mapMatch = (r: MatchRow): Match => ({
  id: r.id, teamId: r.team_id, opponent: r.opponent, matchDate: r.match_date,
  location: r.location, result: r.result as Match['result'],
  academyScore: r.academy_score, opponentScore: r.opponent_score,
  scorers: r.scorers ?? undefined, notes: r.notes ?? undefined,
});

export const mapTraining = (r: TrainingRow): Training => ({
  id: r.id, teamId: r.team_id, title: r.title, sessionDate: r.session_date,
  durationMinutes: r.duration_minutes, objectives: r.objectives,
});

export const mapTransaction = (r: TransactionRow): Transaction => ({
  id: r.id, type: r.type as Transaction['type'], category: r.category, amount: r.amount,
  transactionDate: r.transaction_date, description: r.description, recordedBy: r.recorded_by,
});

export const mapTournament = (r: TournamentRow): Tournament => ({
  id: r.id, name: r.name, organizer: r.organizer, season: r.season,
  startDate: r.start_date, endDate: r.end_date, teamsCount: r.teams_count,
  logoEmoji: r.logo_emoji,
});

export const mapVideo = (r: VideoRow): Video => ({
  id: r.id, title: r.title, videoUrl: r.video_url,
  associatedType: r.associated_type as Video['associatedType'],
  associatedId: r.associated_id, notes: r.notes, createdAt: r.created_at,
  markers: r.markers ?? [],
});

export const mapSettings = (r: SettingsRow): Settings => ({
  id: r.id, name: r.name, logoUrl: r.logo_url, phone: r.phone, email: r.email,
  address: r.address, subscriptionFeeMonthly: r.subscription_fee_monthly,
  subscriptionFeeQuarterly: r.subscription_fee_quarterly,
  subscriptionFeeYearly: r.subscription_fee_yearly,
});

export const mapAuditLog = (r: AuditLogRow): AuditLog => ({
  id: r.id, action: r.action, timestamp: r.timestamp, userRole: r.user_role,
  userName: r.user_name, details: r.details,
});

export const mapNotification = (r: NotificationRow): Notification => ({
  id: r.id, title: r.title, message: r.message, timestamp: r.timestamp,
  type: r.type as Notification['type'], read: r.read,
});

/* ---------- Domain -> row (camelCase to snake_case) ---------- */

export const staffToRow = (s: Staff): StaffRow => ({
  id: s.id, name: s.name, email: s.email, phone: s.phone, role: s.role,
  salary: s.salary, specialization: s.specialization, status: s.status,
  joined_date: s.joinedDate, avatar_url: s.avatarUrl, national_id: s.nationalId ?? null,
  licenses: s.licenses ?? null, experience_years: s.experienceYears ?? null,
  rating: s.rating ?? null, tactical_style: s.tacticalStyle ?? null, notes: s.notes ?? null,
  user_id: s.userId ?? null,
});

export const teamToRow = (t: Team): TeamRow => ({
  id: t.id, name: t.name, age_group: t.ageGroup, coach_id: t.coachId,
  training_days: t.trainingDays, training_time: t.trainingTime, pitch_number: t.pitchNumber,
});

export const playerToRow = (p: Player): PlayerRow => ({
  id: p.id, name: p.name, birth_date: p.birthDate, blood_type: p.bloodType,
  jersey_number: p.jerseyNumber, position: p.position, team_id: p.teamId,
  parent_name: p.parentName, parent_phone: p.parentPhone, parent_email: p.parentEmail,
  parent_id: p.parentId, status: p.status, notes: p.notes, joined_date: p.joinedDate,
});

export const parentToRow = (p: Parent): ParentRow => ({
  id: p.id, name: p.name, national_id: p.nationalId, nationality: p.nationality,
  phone: p.phone, whatsapp_phone: p.whatsappPhone, email: p.email, address: p.address,
  occupation: p.occupation, workplace: p.workplace, avatar_url: p.avatarUrl,
  status: p.status, notes: p.notes, joined_date: p.joinedDate,
});

export const subscriptionToRow = (s: Subscription): SubscriptionRow => ({
  id: s.id, player_id: s.playerId, plan_type: s.planType, amount: s.amount,
  start_date: s.startDate, end_date: s.endDate, status: s.status,
  payment_method: s.paymentMethod ?? null, paid_at: s.paidAt ?? null,
});

export const attendanceToRow = (a: Attendance): AttendanceRow => ({
  id: a.id, player_id: a.playerId, session_date: a.sessionDate,
  session_type: a.sessionType, status: a.status, notes: a.notes ?? null,
});

export const matchToRow = (m: Match): MatchRow => ({
  id: m.id, team_id: m.teamId, opponent: m.opponent, match_date: m.matchDate,
  location: m.location, result: m.result, academy_score: m.academyScore,
  opponent_score: m.opponentScore, scorers: m.scorers ?? null, notes: m.notes ?? null,
});

export const trainingToRow = (t: Training): TrainingRow => ({
  id: t.id, team_id: t.teamId, title: t.title, session_date: t.sessionDate,
  duration_minutes: t.durationMinutes, objectives: t.objectives,
});

export const transactionToRow = (t: Transaction): TransactionRow => ({
  id: t.id, type: t.type, category: t.category, amount: t.amount,
  transaction_date: t.transactionDate, description: t.description, recorded_by: t.recordedBy,
});

export const tournamentToRow = (t: Tournament): TournamentRow => ({
  id: t.id, name: t.name, organizer: t.organizer, season: t.season,
  start_date: t.startDate, end_date: t.endDate, teams_count: t.teamsCount,
  logo_emoji: t.logoEmoji,
});

export const videoToRow = (v: Video): VideoRow => ({
  id: v.id, title: v.title, video_url: v.videoUrl,
  associated_type: v.associatedType, associated_id: v.associatedId,
  notes: v.notes, created_at: v.createdAt, markers: v.markers,
});

export const settingsToRow = (s: Settings): SettingsRow => ({
  id: s.id, name: s.name, logo_url: s.logoUrl, phone: s.phone, email: s.email,
  address: s.address, subscription_fee_monthly: s.subscriptionFeeMonthly,
  subscription_fee_quarterly: s.subscriptionFeeQuarterly,
  subscription_fee_yearly: s.subscriptionFeeYearly,
});

export const auditLogToRow = (a: AuditLog): AuditLogRow => ({
  id: a.id, action: a.action, timestamp: a.timestamp, user_role: a.userRole,
  user_name: a.userName, details: a.details,
});

export const notificationToRow = (n: Notification): NotificationRow => ({
  id: n.id, title: n.title, message: n.message, timestamp: n.timestamp,
  type: n.type, read: n.read,
});

export type { StaffRow, TeamRow, PlayerRow, ParentRow, SubscriptionRow, AttendanceRow, MatchRow, TrainingRow, TransactionRow, TournamentRow, VideoRow, SettingsRow, AuditLogRow, NotificationRow };
