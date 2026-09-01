import { useState, type FormEvent } from 'react';
import { Video as VideoIcon, Plus, Edit2, Trash2, Play, Tag, FileText, Clock, Film, X } from 'lucide-react';
import type { Video, VideoMarker, Match, Training, Player, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, SaveButton } from '@/components/ui';
import { tr } from '@/lib/i18n';

interface VideosProps {
  videos: Video[];
  matches: Match[];
  trainings: Training[];
  players: Player[];
  onVideosChange: (v: Video[]) => void;
  activeRole: Role;
  lang: Lang;
}

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

export function Videos({ videos, matches, trainings, players, onVideosChange, activeRole, lang }: VideosProps) {
  const t = tr(lang);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Video | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewVideo, setViewVideo] = useState<Video | null>(null);

  const canEdit = activeRole === 'manager' || activeRole === 'coach';

  const handleSave = (data: Omit<Video, 'id' | 'createdAt' | 'markers'>, id?: string) => {
    if (id) {
      onVideosChange(videos.map((v) => (v.id === id ? { ...data, id, createdAt: v.createdAt, markers: v.markers } : v)));
    } else {
      onVideosChange([
        ...videos,
        { ...data, id: `video-${Date.now()}`, createdAt: new Date().toISOString(), markers: [] },
      ]);
    }
    setShowAdd(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (deleteId) onVideosChange(videos.filter((v) => v.id !== deleteId));
    setDeleteId(null);
  };

  const handleSaveMarkers = (videoId: string, markers: VideoMarker[]) => {
    onVideosChange(videos.map((v) => (v.id === videoId ? { ...v, markers } : v)));
  };

  const associatedLabel = (v: Video) => {
    if (v.associatedType === 'match') {
      const m = matches.find((mm) => mm.id === v.associatedId);
      return m ? `${lang === 'ar' ? 'مباراة' : 'Match'}: ${m.opponent}` : lang === 'ar' ? 'مباراة' : 'Match';
    }
    const tr1 = trainings.find((tt) => tt.id === v.associatedId);
    return tr1 ? `${lang === 'ar' ? 'تدريب' : 'Training'}: ${tr1.title}` : lang === 'ar' ? 'تدريب' : 'Training';
  };

  return (
    <div className="space-y-5 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.videos} subtitle={`${videos.length} ${lang === 'ar' ? 'فيديو تحليلي' : 'analysis videos'}`}>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t.add}
          </button>
        )}
      </PageHeader>

      {videos.length === 0 ? (
        <EmptyState
          icon={<Film className="h-8 w-8" />}
          title={lang === 'ar' ? 'لا توجد فيديوهات تحليلية' : 'No analysis videos'}
          subtitle={lang === 'ar' ? 'أضف فيديو مباراة أو تدريب لتحليله تكتيكياً مع علامات اللاعبين' : 'Add a match or training video for tactical analysis'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => {
            const ytId = getYouTubeId(v.videoUrl);
            return (
              <div
                key={v.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-900 cursor-pointer" onClick={() => setViewVideo(v)}>
                  {ytId ? (
                    <img
                      src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                      alt={v.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="h-10 w-10 text-slate-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="h-5 w-5 text-slate-900 ms-0.5" fill="currentColor" />
                    </div>
                  </div>
                  {v.markers.length > 0 && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {v.markers.length} {lang === 'ar' ? 'علامة' : 'markers'}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 flex-1 flex flex-col">
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate mb-1">{v.title}</p>
                  <Badge color="blue">{associatedLabel(v)}</Badge>
                  {v.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{v.notes}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {new Date(v.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setViewVideo(v)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition cursor-pointer"
                      >
                        <Tag className="h-3.5 w-3.5" /> {lang === 'ar' ? 'علامات' : 'Markers'}
                      </button>
                      <button
                        onClick={() => setEditItem(v)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(v.id)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showAdd || editItem) && (
        <VideoForm
          video={editItem}
          matches={matches}
          trainings={trainings}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setEditItem(null); }}
        />
      )}

      {viewVideo && (
        <VideoPlayerModal
          video={viewVideo}
          players={players}
          canEdit={canEdit}
          onClose={() => setViewVideo(null)}
          onSaveMarkers={(markers) => {
            handleSaveMarkers(viewVideo.id, markers);
            setViewVideo({ ...viewVideo, markers });
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={lang === 'ar' ? 'حذف الفيديو' : 'Delete video'}
        message={lang === 'ar' ? 'هل أنت متأكد من حذف هذا الفيديو؟ لا يمكن التراجع.' : 'Are you sure? This cannot be undone.'}
        confirmLabel={t.delete}
      />
    </div>
  );
}

/* ----------------------- Video Form ----------------------- */

function VideoForm({
  video,
  matches,
  trainings,
  onSave,
  onClose,
}: {
  video: Video | null;
  matches: Match[];
  trainings: Training[];
  onSave: (data: Omit<Video, 'id' | 'createdAt' | 'markers'>, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: video?.title || '',
    videoUrl: video?.videoUrl || '',
    associatedType: video?.associatedType || ('match' as 'match' | 'training'),
    associatedId: video?.associatedId || '',
    notes: video?.notes || '',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.videoUrl) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form, video?.id);
    setSaving(false);
  };

  const associatedOptions =
    form.associatedType === 'match'
      ? matches.map((m) => ({ id: m.id, label: `${m.opponent} — ${new Date(m.matchDate).toLocaleDateString('en-US')}` }))
      : trainings.map((tt) => ({ id: tt.id, label: `${tt.title} — ${tt.sessionDate}` }));

  return (
    <Modal open onClose={onClose} title={video ? 'تعديل الفيديو' : 'إضافة فيديو تحليلي'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="عنوان الفيديو">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: تحليل تكتيكي لمباراة الهلال" className={inputCls} required />
        </Field>

        <Field label="رابط الفيديو (YouTube)">
          <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." className={inputCls} required dir="ltr" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="النوع">
            <select
              value={form.associatedType}
              onChange={(e) => setForm({ ...form, associatedType: e.target.value as 'match' | 'training', associatedId: '' })}
              className={inputCls}
            >
              <option value="match">مباراة</option>
              <option value="training">تدريب</option>
            </select>
          </Field>
          <Field label="المرتبط بـ">
            <select
              value={form.associatedId}
              onChange={(e) => setForm({ ...form, associatedId: e.target.value })}
              className={inputCls}
            >
              <option value="">— اختر —</option>
              {associatedOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="ملاحظات">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="ملاحظات تكتيكية أو تحليلية..."
            rows={3}
            className={inputCls}
          />
        </Field>

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
            إلغاء
          </button>
          <SaveButton loading={saving}>حفظ</SaveButton>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------- Video Player + Markers Modal ----------------------- */

function VideoPlayerModal({
  video,
  players,
  canEdit,
  onClose,
  onSaveMarkers,
}: {
  video: Video;
  players: Player[];
  canEdit: boolean;
  onClose: () => void;
  onSaveMarkers: (markers: VideoMarker[]) => void;
}) {
  const [markers, setMarkers] = useState<VideoMarker[]>(video.markers);
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [editMarker, setEditMarker] = useState<VideoMarker | null>(null);

  const ytId = getYouTubeId(video.videoUrl);

  const handleSaveMarker = (data: Omit<VideoMarker, 'id'>, id?: string) => {
    if (id) {
      setMarkers(markers.map((m) => (m.id === id ? { ...data, id } : m)));
    } else {
      setMarkers([...markers, { ...data, id: `mark-${Date.now()}` }]);
    }
    setShowMarkerForm(false);
    setEditMarker(null);
  };

  const handleDeleteMarker = (id: string) => {
    setMarkers(markers.filter((m) => m.id !== id));
  };

  return (
    <Modal open onClose={onClose} title={video.title} size="xl">
      <div className="space-y-4">
        {ytId ? (
          <div className="aspect-video rounded-xl overflow-hidden bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="aspect-video rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emerald-600 hover:underline flex items-center gap-2">
              <Play className="h-4 w-4" /> فتح الفيديو في نافذة جديدة
            </a>
          </div>
        )}

        {video.notes && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-400 uppercase">ملاحظات</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{video.notes}</p>
          </div>
        )}

        {/* Markers section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="h-4 w-4 text-emerald-500" />
              {markers.length} علامة تكتيكية
            </h4>
            {canEdit && !showMarkerForm && (
              <button
                onClick={() => setShowMarkerForm(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة علامة
              </button>
            )}
          </div>

          {showMarkerForm && (
            <MarkerForm
              marker={editMarker}
              players={players}
              onSave={handleSaveMarker}
              onClose={() => { setShowMarkerForm(false); setEditMarker(null); }}
            />
          )}

          {markers.length === 0 && !showMarkerForm ? (
            <div className="text-center py-6 text-xs text-slate-400 font-semibold">
              لا توجد علامات بعد. أضف علامة لتحديد لحظة مهمة مع اللاعبين المعنيين.
            </div>
          ) : (
            <div className="space-y-2">
              {markers.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
                >
                  <div className="shrink-0 px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-black tabular-nums" dir="ltr">
                    {m.timestamp}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{m.title}</p>
                    {m.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{m.notes}</p>}
                    {m.taggedPlayerIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.taggedPlayerIds.map((pid) => {
                          const p = players.find((pp) => pp.id === pid);
                          if (!p) return null;
                          return (
                            <span key={pid} className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                              {p.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setEditMarker(m); setShowMarkerForm(true); }} className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDeleteMarker(m.id)} className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => { onSaveMarkers(markers); onClose(); }} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer">
              حفظ العلامات
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------- Marker Form ----------------------- */

function MarkerForm({
  marker,
  players,
  onSave,
  onClose,
}: {
  marker: VideoMarker | null;
  players: Player[];
  onSave: (data: Omit<VideoMarker, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    timestamp: marker?.timestamp || '',
    title: marker?.title || '',
    notes: marker?.notes || '',
    taggedPlayerIds: marker?.taggedPlayerIds || ([] as string[]),
  });

  const togglePlayer = (id: string) => {
    setForm((prev) => ({
      ...prev,
      taggedPlayerIds: prev.taggedPlayerIds.includes(id)
        ? prev.taggedPlayerIds.filter((p) => p !== id)
        : [...prev.taggedPlayerIds, id],
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.timestamp || !form.title) return;
    onSave(form, marker?.id);
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 mb-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="الوقت (MM:SS)">
          <input value={form.timestamp} onChange={(e) => setForm({ ...form, timestamp: e.target.value })} placeholder="02:15" className={inputCls} required dir="ltr" />
        </Field>
        <Field label="العنوان">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="الهدف الأول" className={inputCls} required />
        </Field>
      </div>
      <Field label="ملاحظات">
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="وصف اللحظة..." rows={2} className={inputCls} />
      </Field>
      <Field label="وسم اللاعبين">
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {players.map((p) => {
            const checked = form.taggedPlayerIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlayer(p.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  checked
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
          إلغاء
        </button>
        <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer">
          حفظ
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
