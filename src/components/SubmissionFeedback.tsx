import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { FileText, PaperPlaneTilt } from '@phosphor-icons/react';
import '../submission-feedback.css';

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  sending: boolean;
}

export function ApplicationSubmitButton({ sending, children, disabled, className = '', type = 'button', ...props }: SubmitButtonProps) {
  return <button {...props} type={type} disabled={disabled || sending} aria-busy={sending}
    className={`primary-button application-submit-button ${className}`}>
    <span className="application-submit-label">{sending ? 'Отправка…' : children}</span>
    <span className="application-submit-icon" aria-hidden="true"><PaperPlaneTilt size={20} weight="duotone" /></span>
  </button>;
}

export function SubmissionPending() {
  return <div className="submission-pending" role="status" aria-live="polite" aria-atomic="true">
    <div className="submission-pending-art" aria-hidden="true">
      <FileText size={32} weight="duotone" />
      <span className="submission-pending-plane"><PaperPlaneTilt size={22} weight="fill" /></span>
    </div>
    <div className="submission-pending-copy">
      <strong>Отправляем в Discord</strong>
      <span>Дождитесь подтверждения, оно появится здесь.</span>
      <div className="submission-pending-track" aria-hidden="true"><span /></div>
    </div>
  </div>;
}

export function SubmissionSuccess({ title, children }: { title: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="glass submission-success" role="status" aria-live="polite" aria-atomic="true">
    <div className="submission-success-seal" aria-hidden="true">
      <span className="submission-success-ripple" />
      <svg viewBox="0 0 96 96" fill="none" width="96" height="96">
        <circle cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="1" opacity=".18" />
        <circle className="submission-success-ring" cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="2" pathLength="1" />
        <path className="submission-success-check" d="M32 48L43 59L64 37" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
      </svg>
    </div>
    <h3 ref={heading} tabIndex={-1} className="submission-success-title">{title}</h3>
    <div className="submission-success-content">{children}</div>
  </section>;
}
