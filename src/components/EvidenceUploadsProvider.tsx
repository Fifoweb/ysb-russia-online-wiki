import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Counts = { pending: number; failed: number };
const Context = createContext({ reason: undefined as string | undefined, update: (_id: string, _counts: Counts | null) => {} });

export function EvidenceUploadsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<Record<string, Counts>>({});
  const update = useCallback((id: string, counts: Counts | null) => setWidgets(current => {
    if (!counts) { if (!(id in current)) return current; const next = { ...current }; delete next[id]; return next; }
    if (current[id]?.pending === counts.pending && current[id]?.failed === counts.failed) return current;
    return { ...current, [id]: counts };
  }), []);
  const reason = Object.values(widgets).some(widget => widget.pending > 0) ? 'Дождитесь завершения загрузки скриншотов.'
    : Object.values(widgets).some(widget => widget.failed > 0) ? 'Повторите загрузку файлов с ошибкой или уберите их из списка.' : undefined;
  const value = useMemo(() => ({ reason, update }), [reason, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useEvidenceUploadStatus = () => useContext(Context);
