export type Role = 'manager' | 'accountant' | 'coach' | 'receptionist' | 'parent';

export interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  salary: number;
  specialization: string;
  status: 'active' | 'inactive' | 'pending';
  joinedDate: string;
  avatarUrl: string;
  nationalId?: string;
  licenses?: string[];
  experienceYears?: number;
  rating?: number;
  tacticalStyle?: string;
  notes?: string;
  userId?: string;
}

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  coachId: string;
  trainingDays: string[];
  trainingTime: string;
  pitchNumber: string;
}

export interface Player {
  id: string;
  name: string;
  birthDate: string;
  bloodType: string;
  jerseyNumber: number;
  position: string;
  teamId: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  parentId: string;
  status: 'active' | 'inactive';
  notes: string;
  joinedDate: string;
}

export interface Parent {
  id: string;
  name: string;
  nationalId: string;
  nationality: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  address: string;
  occupation: string;
  workplace: string;
  avatarUrl: string;
  status: 'active' | 'inactive';
  notes: string;
  joinedDate: string;
}

export interface Subscription {
  id: string;
  playerId: string;
  planType: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  startDate: string;
  endDate: string;
  status: 'paid' | 'unpaid';
  paymentMethod?: string;
  paidAt?: string;
}

export interface Attendance {
  id: string;
  playerId: string;
  sessionDate: string;
  sessionType: 'training' | 'match';
  status: 'present' | 'absent' | 'excused';
  notes?: string;
}

export interface Match {
  id: string;
  teamId: string;
  opponent: string;
  matchDate: string;
  location: string;
  result: 'win' | 'loss' | 'draw' | 'scheduled';
  academyScore: number;
  opponentScore: number;
  scorers?: string;
  notes?: string;
}

export interface Training {
  id: string;
  teamId: string;
  title: string;
  sessionDate: string;
  durationMinutes: number;
  objectives: string;
}

export interface Transaction {
  id: string;
  type: 'revenue' | 'expense';
  category: string;
  amount: number;
  transactionDate: string;
  description: string;
  recordedBy: string;
}

export interface Tournament {
  id: string;
  name: string;
  organizer: string;
  season: string;
  startDate: string;
  endDate: string;
  teamsCount: number;
  logoEmoji: string;
}

export interface VideoMarker {
  id: string;
  timestamp: string;
  title: string;
  notes: string;
  taggedPlayerIds: string[];
}

export interface Video {
  id: string;
  title: string;
  videoUrl: string;
  associatedType: 'match' | 'training';
  associatedId: string;
  notes: string;
  createdAt: string;
  markers: VideoMarker[];
}

export interface AuditLog {
  id: string;
  action: string;
  timestamp: string;
  userRole: string;
  userName: string;
  details: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
}

export interface Settings {
  id: string;
  name: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  subscriptionFeeMonthly: number;
  subscriptionFeeQuarterly: number;
  subscriptionFeeYearly: number;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type Lang = 'ar' | 'en';
export type ViewId =
  | 'dashboard'
  | 'approvals'
  | 'players'
  | 'parents'
  | 'teams'
  | 'staff'
  | 'subscriptions'
  | 'attendance'
  | 'schedules'
  | 'tournaments'
  | 'videos'
  | 'reports'
  | 'audit-logs'
  | 'mobile'
  | 'ai-center'
  | 'messages'
  | 'settings';
