import type {
  Staff, Team, Player, Parent, Subscription, Attendance,
  Match, Training, Transaction, Tournament, Video, Settings,
  AuditLog,
} from '@/types';

const POSITIONS = ['مهاجم', 'خط وسط', 'مدافع', 'خط وسط', 'مدافع', 'مهاجم', 'مدافع', 'خط وسط', 'حارس مرمى'];
const BLOOD_TYPES = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-'];

const rawPlayers: { name: string; cpr: string; paid: boolean; teamId: string }[] = [
  { name: 'خالد جاسم يعقوب', cpr: '140412832', paid: false, teamId: 'team-1' },
  { name: 'صقر محمد جمال', cpr: '140114629', paid: true, teamId: 'team-1' },
  { name: 'عبدالرحمن خليفة الكعبي', cpr: '141102047', paid: true, teamId: 'team-1' },
  { name: 'عمرو أبوالقاسم عبدالرحيم', cpr: '140616624', paid: false, teamId: 'team-1' },
  { name: 'عبدالله أسامة بوقيس', cpr: '140403906', paid: true, teamId: 'team-1' },
  { name: 'بدر عبدالله سالم', cpr: '141005025', paid: false, teamId: 'team-1' },
  { name: 'محمد عبدالله العوضي', cpr: '140714952', paid: false, teamId: 'team-1' },
  { name: 'كرار إبراهيم علي', cpr: '140310800', paid: true, teamId: 'team-1' },
  { name: 'حمد محمد صالح', cpr: '140300740', paid: true, teamId: 'team-1' },
  { name: 'حسين علي راشد', cpr: '150313292', paid: false, teamId: 'team-2' },
  { name: 'محمد بدر محمد', cpr: '150312539', paid: true, teamId: 'team-2' },
  { name: 'عبدالله محمد المالود', cpr: '151010293', paid: true, teamId: 'team-2' },
  { name: 'عبدالله قاسم عسكر', cpr: '150802072', paid: true, teamId: 'team-2' },
  { name: 'راشد حسن بوقيس', cpr: '151057575', paid: true, teamId: 'team-2' },
  { name: 'خالد وليد احمد', cpr: '150519281', paid: true, teamId: 'team-2' },
  { name: 'يوسف احمد زويد', cpr: '150300964', paid: true, teamId: 'team-2' },
  { name: 'يوسف احمد عيسى', cpr: '150405723', paid: true, teamId: 'team-2' },
  { name: 'سلطان سالم عبدالله', cpr: '151001634', paid: true, teamId: 'team-2' },
  { name: 'خالد محمد جمال', cpr: '151214700', paid: true, teamId: 'team-2' },
  { name: 'تركي علي بوقيس', cpr: '170916502', paid: true, teamId: 'team-3' },
  { name: 'فهد عبدالرحمن مبارك', cpr: '161129471', paid: false, teamId: 'team-3' },
  { name: 'يوسف محمد احمد', cpr: '170420302', paid: true, teamId: 'team-3' },
  { name: 'عبدالله رشيد عبدالله', cpr: '160404967', paid: true, teamId: 'team-3' },
  { name: 'عمر مختار احمد', cpr: '160504783', paid: true, teamId: 'team-3' },
  { name: 'حسين عبدالسميع مفتاح', cpr: '160106427', paid: true, teamId: 'team-3' },
  { name: 'فيصل عبدالله العوضي', cpr: '171216989', paid: false, teamId: 'team-3' },
  { name: 'يوسف محمد الهاجري', cpr: '160112753', paid: true, teamId: 'team-3' },
  { name: 'محمد حسن بوقيس', cpr: '180810081', paid: true, teamId: 'team-3' },
  { name: 'فيصل علي عبدالرقيب', cpr: '170210987', paid: true, teamId: 'team-3' },
];

function cprToBirthDate(cpr: string): string {
  const yy = cpr.substring(0, 2);
  const mm = cpr.substring(2, 4);
  const dd = cpr.substring(4, 6);
  let m = parseInt(mm) || 1;
  if (m < 1 || m > 12) m = 1;
  let d = parseInt(dd) || 1;
  if (d < 1 || d > 28) d = 1;
  return `20${yy}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

function parentNameFromPlayer(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? parts.slice(1).join(' ') : `والد ${name}`;
}

export const SEED_STAFF: Staff[] = [
  { id: 'staff-shomili', name: 'الأستاذ محمد الشميلي', email: 'mohameedalshomili@gmail.com', phone: '39001122', role: 'manager', salary: 15000, specialization: 'الرئيس التنفيذي والمالك العام للأكاديمية - كامل الصلاحيات الفائقة', status: 'active', joinedDate: '2026-07-21', avatarUrl: '👑', nationalId: '1029384756', licenses: ['رخصة الإدارة التنفيذية الرياضية العليا'], experienceYears: 15, rating: 5, notes: 'المالك العام للأكاديمية والمشرف الأعلى على كامل الصلاحيات والأنظمة الأمنية والمالية.' },
  { id: 'staff-1', name: 'الكابتن أحمد الحربي', email: 'ahmed@shooter.com', phone: '0551122334', role: 'manager', salary: 12000, specialization: 'إدارة وتطوير برامج تدريب الناشئين والشباب', status: 'active', joinedDate: '2025-01-10', avatarUrl: '🧔', nationalId: '1098234762', licenses: ['رخصة PRO الآسيوية', 'ماجستير الإدارة الرياضية'], experienceYears: 15, rating: 5, tacticalStyle: 'الضغط العالي والاستحواذ (4-3-3)', notes: 'المدير العام والمسؤول الفني الأول عن تخطيط برامج الفئات السنية بالأكاديمية.' },
  { id: 'staff-2', name: 'الأستاذ خالد السديري', email: 'khaled@shooter.com', phone: '0552233445', role: 'accountant', salary: 8000, specialization: 'المحاسبة والتدقيق المالي وإدارة الفواتير', status: 'active', joinedDate: '2025-02-15', avatarUrl: '👨‍💼', nationalId: '1082736452', notes: 'مسؤول الميزانية، الإيرادات والمصروفات وتسجيل فواتير أولياء الأمور والرواتب.' },
  { id: 'staff-3', name: 'الكابتن محمد يوسف', email: 'mohamed@shooter.com', phone: '0553344556', role: 'coach', salary: 7500, specialization: 'تدريب حراس المرمى والتكتيك الدفاعي للمرمى', status: 'active', joinedDate: '2025-03-01', avatarUrl: '🧤', nationalId: '1027384912', licenses: ['رخصة A الآسيوية للتدريب', 'شهادة FIFA لحراسة المرمى'], experienceYears: 10, rating: 4.8, tacticalStyle: 'بناء اللعب من الخلف والتمركز الدفاعي', notes: 'مدرب حراس المرمى المعتمد للفئات السنية U15 وU12.' },
  { id: 'staff-4', name: 'الكابتن طارق العتيبي', email: 'tareq@shooter.com', phone: '0554455667', role: 'coach', salary: 7000, specialization: 'تدريب اللياقة البدنية، السرعات والتوجيه الحركي للناشئين', status: 'active', joinedDate: '2025-04-12', avatarUrl: '🏃‍♂️', nationalId: '1038472910', licenses: ['رخصة B الآسيوية للتدريب', 'شهادة اللياقة البدنية والسرعات الحركية'], experienceYears: 8, rating: 4.7, tacticalStyle: 'كرة القدم الشاملة والتحولات السريعة (4-2-3-1)', notes: 'المشرف البدني ومدير الحصص التدريبية التكتيكية للسرعات.' },
  { id: 'staff-5', name: 'سارة الدوسري', email: 'sara@shooter.com', phone: '0555566778', role: 'receptionist', salary: 4500, specialization: 'خدمة العملاء والتواصل الفعال مع أولياء الأمور وتسجيل الحضور الميداني', status: 'active', joinedDate: '2025-05-01', avatarUrl: '👩‍💼', nationalId: '1092837465', notes: 'المسؤولة عن استقبال أولياء الأمور وتسجيل الطلبات الميدانية وتتبع حضور اللاعبين.' },
];

export const SEED_TEAMS: Team[] = [
  { id: 'team-1', name: 'فئة 2014 (U-12)', ageGroup: 'U-12', coachId: 'staff-3', trainingDays: ['الأحد', 'الثلاثاء', 'الخميس'], trainingTime: '17:30', pitchNumber: 'الملعب الأولمبي الرئيسي' },
  { id: 'team-2', name: 'فئة 2015 (U-11)', ageGroup: 'U-11', coachId: 'staff-4', trainingDays: ['الإثنين', 'الأربعاء', 'السبت'], trainingTime: '16:00', pitchNumber: 'الملعب الفرعي (ب)' },
  { id: 'team-3', name: 'فئة 2016 (U-10)', ageGroup: 'U-10', coachId: 'staff-3', trainingDays: ['الإثنين', 'الأربعاء'], trainingTime: '15:30', pitchNumber: 'ملعب الصالة المغطاة' },
];

export const SEED_PLAYERS: Player[] = rawPlayers.map((p, i) => {
  const n = i;
  return {
    id: `player-${i + 1}`,
    name: p.name,
    birthDate: cprToBirthDate(p.cpr),
    bloodType: BLOOD_TYPES[n % BLOOD_TYPES.length],
    jerseyNumber: (n % 15) + 2,
    position: POSITIONS[n % POSITIONS.length],
    teamId: p.teamId,
    parentName: parentNameFromPlayer(p.name),
    parentPhone: `39${100000 + n * 1337 % 899999}`,
    parentEmail: `parent${i + 1}@shooter.bh`,
    parentId: `parent-${i + 1}`,
    status: 'active',
    notes: `الرقم السكاني: ${p.cpr}`,
    joinedDate: '2025-01-15',
  };
});

export const SEED_PARENTS: Parent[] = rawPlayers.map((p, i) => {
  const phone = `39${100000 + i * 1337 % 899999}`;
  return {
    id: `parent-${i + 1}`,
    name: parentNameFromPlayer(p.name),
    nationalId: `1${phone}2`,
    nationality: 'بحريني',
    phone,
    whatsappPhone: phone,
    email: `parent${i + 1}@shooter.bh`,
    address: i % 2 === 0 ? 'الرفاع، مملكة البحرين' : 'المنامة، مملكة البحرين',
    occupation: i % 3 === 0 ? 'مهندس' : i % 3 === 1 ? 'رجل أعمال' : 'موظف حكومي',
    workplace: i % 3 === 0 ? 'وزارة الأشغال' : i % 3 === 1 ? 'القطاع الخاص' : 'وزارة التربية والتعليم',
    avatarUrl: '👨',
    status: 'active',
    notes: `ولي أمر اللاعب البطل ${p.name}`,
    joinedDate: '2025-01-15',
  };
});

export const SEED_SUBSCRIPTIONS: Subscription[] = rawPlayers.map((p, i) => ({
  id: `sub-${i + 1}`,
  playerId: `player-${i + 1}`,
  planType: 'monthly',
  amount: 35,
  startDate: '2026-07-01',
  endDate: '2026-08-01',
  status: p.paid ? 'paid' : 'unpaid',
  paymentMethod: i % 3 === 0 ? 'شبكة' : i % 3 === 1 ? 'نقدي' : 'تحويل بنكي',
  paidAt: p.paid ? '2026-07-01T10:00:00' : undefined,
}));

export const SEED_ATTENDANCE: Attendance[] = [
  { id: 'att-1', playerId: 'player-1', sessionDate: '2026-07-19', sessionType: 'training', status: 'present' },
  { id: 'att-2', playerId: 'player-2', sessionDate: '2026-07-19', sessionType: 'training', status: 'present' },
  { id: 'att-3', playerId: 'player-3', sessionDate: '2026-07-18', sessionType: 'training', status: 'present' },
  { id: 'att-4', playerId: 'player-4', sessionDate: '2026-07-18', sessionType: 'training', status: 'absent', notes: 'وعكة صحية' },
  { id: 'att-5', playerId: 'player-5', sessionDate: '2026-07-18', sessionType: 'training', status: 'excused' },
];

export const SEED_MATCHES: Match[] = [
  { id: 'match-1', teamId: 'team-1', opponent: 'أكاديمية الهلال للبراعم', matchDate: '2026-07-15T18:00:00', location: 'ملعب الهلال الرديف، الرياض', result: 'win', academyScore: 3, opponentScore: 1, scorers: 'يزيد الحربي (2 هدف)، سلمان السديري (صنع حارس!)', notes: 'مباراة حماسية تكتيكية ممتازة للفريق واستحواذ بنسبة 60%' },
  { id: 'match-2', teamId: 'team-2', opponent: 'أكاديمية المواهب الوطنية', matchDate: '2026-07-22T17:00:00', location: 'ملعب أكاديمية شوتر الرئيسي', result: 'scheduled', academyScore: 0, opponentScore: 0, notes: 'الاستعداد التكتيكي على الكرات الثابتة وبناء اللعب من الخلف' },
  { id: 'match-3', teamId: 'team-3', opponent: 'أكاديمية مهد الرياضية', matchDate: '2026-07-29T16:30:00', location: 'ملعب الصالة المغلقة لمعهد إعداد القادة', result: 'scheduled', academyScore: 0, opponentScore: 0 },
];

export const SEED_TRAINING: Training[] = [
  { id: 'train-1', teamId: 'team-1', title: 'تطوير بناء اللعب من الحارس والضغط العالي', sessionDate: '2026-07-21', durationMinutes: 90, objectives: '1. دقة تمرير الحارس تحت الضغط. 2. تضييق المساحات عند فقدان الكرة. 3. التحول السريع للهجوم.' },
  { id: 'train-2', teamId: 'team-2', title: 'مهارات التمرير القصير والتحرك القطري في المساحات الضيقة', sessionDate: '2026-07-22', durationMinutes: 90, objectives: '1. دقة ولمسة واحدة (One-touch). 2. المربعات التكتيكية (Rondo). 3. التسديد على المرمى من زوايا صعبة.' },
];

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: 't-1', type: 'revenue', category: 'subscription', amount: 320, transactionDate: '2026-01-01', description: 'اشتراك سنوي للاعب صقر محمد جمال', recordedBy: 'خالد السديري' },
  { id: 't-2', type: 'revenue', category: 'subscription', amount: 90, transactionDate: '2026-06-01', description: 'اشتراك ربع سنوي للاعب عبدالرحمن خليفة الكعبي', recordedBy: 'خالد السديري' },
  { id: 't-3', type: 'revenue', category: 'subscription', amount: 35, transactionDate: '2026-07-01', description: 'اشتراك شهري للاعب عبدالله أسامة بوقيس', recordedBy: 'خالد السديري' },
  { id: 't-4', type: 'expense', category: 'salary', amount: 7500, transactionDate: '2026-07-01', description: 'راتب شهر يونيو - الكابتن محمد يوسف', recordedBy: 'خالد السديري' },
  { id: 't-5', type: 'expense', category: 'salary', amount: 7000, transactionDate: '2026-07-01', description: 'راتب شهر يونيو - الكابتن طارق العتيبي', recordedBy: 'خالد السديري' },
  { id: 't-6', type: 'expense', category: 'equipment', amount: 2450, transactionDate: '2026-07-05', description: 'شراء كرات قدم مقاس 4 و5 تكتيكية وأقماع وحواجز تدريب', recordedBy: 'أحمد الحربي' },
  { id: 't-7', type: 'expense', category: 'rent', amount: 5000, transactionDate: '2026-07-01', description: 'إيجار الملاعب الشهري للأكاديمية', recordedBy: 'أحمد الحربي' },
];

export const SEED_TOURNAMENTS: Tournament[] = [
  { id: 'tour-1', name: 'كأس الرياض للبراعم الممتازة', organizer: 'الاتحاد السعودي لكرة القدم', season: '2026', startDate: '2026-07-01', endDate: '2026-08-15', teamsCount: 16, logoEmoji: '🏆' },
  { id: 'tour-2', name: 'دوري أبطال أكاديميات المنطقة الوسطى', organizer: 'رابطة الهواة والأكاديميات بالرياض', season: '2026', startDate: '2026-09-10', endDate: '2026-11-20', teamsCount: 12, logoEmoji: '🎖️' },
];

export const SEED_VIDEOS: Video[] = [
  {
    id: 'video-1',
    title: 'تحليل تكتيكي لمباراة الهلال الرديف وتحركات المهاجمين',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    associatedType: 'match',
    associatedId: 'match-1',
    notes: 'ملاحظة تحركات اللاعبين في الثلث الأخير، ودقة التمريرات البينية وسرعة الارتداد من الدفاع للهجوم.',
    createdAt: '2026-07-16T12:00:00',
    markers: [
      { id: 'mark-1', timestamp: '02:15', title: 'الهدف الأول - يزيد الحربي', notes: 'تمريرة بينية ممتازة من نواف القحطاني، وتحرك يزيد لكسر التسلل والإنهاء بلمسة واحدة زاحفة على يمين الحارس.', taggedPlayerIds: ['player-1', 'player-3'] },
      { id: 'mark-2', timestamp: '05:40', title: 'خطأ تمركز في الدفاع وتغطية بطيئة', notes: 'التباعد بين قلبي الدفاع سمح للخصم بالدخول في عمق منطقة الجزاء والتسديد المريح.', taggedPlayerIds: ['player-4'] },
    ],
  },
];

export const SEED_SETTINGS: Settings = {
  id: 'settings-1',
  name: 'أكاديمية شوتر لكرة القدم - Shooter Academy',
  logoUrl: '🎯',
  phone: '+973 17123456',
  email: 'info@shooter-academy.com',
  address: 'مملكة البحرين، المنامة، ضاحية السيف - مجمع الملاعب الحديثة',
  subscriptionFeeMonthly: 35,
  subscriptionFeeQuarterly: 90,
  subscriptionFeeYearly: 320,
};

export const SEED_AUDIT_LOGS: AuditLog[] = [
  { id: 'log-1', action: 'إنشاء حصة تدريبية', timestamp: '2026-07-20T10:30:00', userRole: 'manager', userName: 'أحمد الحربي', details: 'تم جدولة تدريب جديد لفريق النخبة الأزرق تحت 15 سنة ليوم 2026-07-21' },
  { id: 'log-2', action: 'تحديث نتيجة مباراة', timestamp: '2026-07-20T11:45:00', userRole: 'coach', userName: 'الكابتن محمد يوسف', details: 'تم تدوين نتيجة مباراة الهلال الرديف 3-1 لصالح الأكاديمية' },
];
