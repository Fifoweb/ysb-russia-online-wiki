import { Clock3 } from 'lucide-react';

export default function ApplicationCooldownBanner({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="application-cooldown" role="status" aria-live="off">
      <div className="application-cooldown-icon" aria-hidden="true"><Clock3 size={22} /></div>
      <div className="application-cooldown-copy">
        <span className="application-cooldown-label">Пауза между заявками</span>
        <p>Следующую заявку можно отправить через <strong>{time}</strong></p>
        <div className="application-cooldown-track" aria-hidden="true">
          <span style={{ width: `${(seconds / 60) * 100}%` }} />
        </div>
      </div>
      <span className="application-cooldown-clock" aria-hidden="true">{time}</span>
    </div>
  );
}
