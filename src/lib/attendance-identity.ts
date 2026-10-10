import { LocalizedError } from './user-errors';
import type { Attendance } from '@/types';
export function attendanceKey(row: Omit<Attendance, 'id'>): string {
  return JSON.stringify([row.playerId, row.sessionType, row.sessionType === 'match' ? row.matchId || row.sessionDate : row.trainingId || row.sessionDate]);
}
export function assertNewAttendance(existing: Attendance[], incoming: Omit<Attendance, 'id'>[]): void {
  const keys = new Set(existing.map(attendanceKey));
  for (const row of incoming) {
    const key = attendanceKey(row);
    if (keys.has(key)) throw new LocalizedError('حضور هذا اللاعب مسجل لهذه الجلسة بالفعل. راجع السجل الموجود.', 'Attendance already recorded for this player and session. Review the existing record.');
    keys.add(key);
  }
}
