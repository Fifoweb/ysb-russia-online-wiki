import type { AnchorHTMLAttributes } from 'react';

interface PortalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  path: string;
  onNavigate: (path: string) => void;
}

export default function PortalLink({ path, onNavigate, children, ...props }: PortalLinkProps) {
  return <a {...props} href={import.meta.env.BASE_URL.replace(/\/$/, '') + path}
    onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return;
      event.preventDefault();
      onNavigate(path);
    }}>{children}</a>;
}
