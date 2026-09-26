import { Info } from 'lucide-react';

type Props = {
  reason?: string;
  remainingSeconds: number;
  sending: boolean;
};

export default function ApplicationSubmitHint({ reason, remainingSeconds, sending }: Props) {
  if (!reason || remainingSeconds > 0 || sending) return null;

  return (
    <p className="flex items-start gap-2 text-sm text-sky-100/80" role="status">
      <Info size={16} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
      <span>{reason}</span>
    </p>
  );
}
