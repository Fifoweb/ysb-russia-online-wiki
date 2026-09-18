import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import { emptyProfile, loadProfile, saveProfile, Profile } from '../lib/db';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onSignOut: () => void;
}

export default function ProfileModal({ user, onClose, onSignOut }: ProfileModalProps) {
  const [p, setP] = useState<Profile>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const avatar = meta.avatar_url;
  const discordName = meta.full_name || meta.name || user.email || 'Пользователь';

  useEffect(() => { loadProfile(user.id).then(setP); }, [user.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    const ok = await saveProfile(user.id, p);
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const field = (label: string, key: keyof Profile, placeholder: string) => (
    <label className="block">
      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{label}</span>
      <input value={p[key]} onChange={e => setP({ ...p, [key]: e.target.value })} placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
    </label>
  );

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md glass rounded-2xl border border-purple-500/20 p-6 max-h-[90vh] overflow-y-auto">

        {/* Discord identity */}
        <div className="flex items-center gap-4 pb-5 border-b border-purple-500/15 mb-5">
          {avatar ? (
            <img src={avatar} alt="" className="w-14 h-14 rounded-full border border-purple-500/30" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xl">👤</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{discordName}</div>
            <div className="text-[10px] font-mono text-[#5865F2] flex items-center gap-1.5 mt-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 00-4.93-1.51 13.78 13.78 0 00-.64 1.28 18.27 18.27 0 00-5.5 0 13.78 13.78 0 00-.64-1.28h-.05A19.82 19.82 0 003.64 4.37 19.07 19.07 0 00.11 18.06a19.9 19.9 0 006.04 3.03c.46-.66.86-1.36 1.25-2.09a12.9 12.9 0 01-1.96-.94c.16-.12.32-.24.47-.37a14.2 14.2 0 0012.18 0c.15.13.31.25.47.37-.62.37-1.28.69-1.96.94.39.73.79 1.43 1.25 2.09a19.84 19.84 0 006.04-3.03 19.03 19.03 0 00-3.53-13.69zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42s.95-2.42 2.15-2.42c1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42z"/></svg>
              Discord-аккаунт
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 border border-purple-500/15 flex items-center justify-center text-gray-400 hover:text-white transition-all shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Editable profile */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider">Личный кабинет</h3>
          {field('ФИО', 'full_name', 'Комиссарова Кира')}
          {field('Звание', 'rank', 'Генерал-майор')}
          {field('Должность', 'position', 'Оперуполномоченный УСБ ГИБДД')}
          {field('Личный номер', 'badge', 'РО-0001')}
          <label className="block">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">О себе</span>
            <textarea value={p.about} onChange={e => setP({ ...p, about: e.target.value })} placeholder="Пара слов о себе..." rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all resize-none placeholder:text-gray-600" />
          </label>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-sm text-purple-300 hover:bg-purple-500/30 transition-all font-mono disabled:opacity-50">
            {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
          <button onClick={onSignOut}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-red-500/20 text-sm text-red-400 hover:bg-red-500/10 transition-all font-mono">
            Выйти
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
