export type Role = 'manager' | 'accountant' | 'coach' | 'receptionist' | 'parent';

export interface Staff {
  version?: number;
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
  privateFieldsLoaded?: boolean;
  nationalId?: string;
  licenses?: string[];
  experienceYears?: number;
  rating?: number;
  tacticalStyle?: string;
  notes?: string;
  userId?: string;
}

export interface Team {
  version?: number;
  id: string;
  name: string;
  ageGroup: string;
  coachId: string;
  trainingDays: string[];
  trainingTime: string;
  pitchNumber: string;
}

export interface Player {
  version?: number;
  privateFieldsLoaded?: boolean;
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
  version?: number;
  userId?: string;
  privateFieldsLoaded?: boolean;
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
  version?: number;
  id: string;
  playerId: string;
  planType: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  amount: number;
  startDate: string;
  endDate: string;
  status: 'paid' | 'unpaid';
  paymentMethod?: string;
  paidAt?: string;
}

export interface Attendance {
  version?: number;
  id: string;
  playerId: string;
  sessionDate: string;
  sessionType: 'training' | 'match';
  status: 'present' | 'absent' | 'excused';
  notes?: string;
}

export interface Match {
  version?: number;
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
  version?: number;
  id: string;
  teamId: string;
  title: string;
  sessionDate: string;
  durationMinutes: number;
  objectives: string;
}

export interface Transaction {
  version?: number;
  subscriptionId?: string;
  playerId?: string;
  id: string;
  type: 'revenue' | 'expense';
  category: string;
  amount: number;
  transactionDate: string;
  description: string;
  recordedBy: string;
}

export interface Tournament {
  version?: number;
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
  version?: number;
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
  version?: number;
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
}

export interface Settings {
  version?: number;
  id: string;
  name: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  subscriptionFeeMonthly: number;
  subscriptionFeeQuarterly: number;
  subscriptionFeeSemiAnnual: number;
  subscriptionFeeYearly: number;
}

export interface CurrentUser {
  authUserId?: string;
  registrationOnly?: boolean;
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
  | 'settings'
  | 'registration'
  | 'registration-admin';

/* ---- Registration module ---- */

export type RegistrationType = 'initial_onboarding' | 'new_application';
export type RegistrationStatus = 'draft' | 'pending' | 'under_review' | 'needs_info' | 'approved' | 'rejected';

export interface RegistrationParentInput {
  requestId?: string;
  registrationType: RegistrationType;
  fullName: string;
  nationalId: string;
  phone: string;
  email: string;
  whatsapp?: string;
  nationality?: string;
  occupation?: string;
  workplace?: string;
  address?: string;
  notes?: string;
}

export interface RegistrationChildInput {
  childId?: string;
  clientKey: string;
  fullName: string;
  nationalId: string;
  birthDate: string;
  bloodType?: string;
  notes?: string;
}

export interface RegistrationDraftResult {
  applicationId: string;
  status: 'draft';
  registrationType: RegistrationType;
  children: Array<{
    clientKey?: string;
    childId: string;
    fullName: string;
  }>;
}

export interface RegistrationChild {
  clientKey?: string;
  id: string;
  fullName: string;
  nationalId?: string;
  birthDate: string;
  bloodType?: string;
  notes?: string;
  playerId?: string;
}

export interface RegistrationDocument {
  id: string;
  childId?: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileCategory: 'photo' | 'document';
  documentType?: string;
}

export interface RegistrationApplication {
  id: string;
  registrationType: RegistrationType;
  status: RegistrationStatus;
  parentName: string;
  parentNationalId?: string;
  parentPhone: string;
  parentEmail: string;
  parentWhatsapp?: string;
  parentNationality?: string;
  parentOccupation?: string;
  parentWorkplace?: string;
  parentAddress?: string;
  parentNotes?: string;
  children: RegistrationChild[];
  documents: RegistrationDocument[];
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}
