import { useEffect, useRef, type ReactNode } from 'react';

interface PortalDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  id?: string;
  className?: string;
  children: ReactNode;
}

export default function PortalDialog({ open, onClose, label, id, className = '', children }: PortalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} id={id} aria-label={label} className={'portal-dialog ' + className}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {open && children}
  </dialog>;
}
