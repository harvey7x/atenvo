import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/hooks/useToast';

function mark(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <div className="org-switch" ref={ref}>
      <button className="org-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="dotmark">{mark(currentOrg.name)}</span>
        <span>{currentOrg.name}</span>
        <span className="chev"><Icon name="chevron-down" /></span>
      </button>
      <div className={'org-menu' + (open ? ' show' : '')} role="menu">
        {orgs.map((o) => (
          <button
            key={o.id}
            className="oi"
            role="menuitemradio"
            aria-checked={o.id === currentOrg.id}
            onClick={() => {
              setCurrentOrg(o.id);
              setOpen(false);
              if (o.id !== currentOrg.id) toast('Organização: ' + o.name);
            }}
          >
            <span className="dotmark">{mark(o.name)}</span>
            <span>
              <span className="nm" style={{ display: 'block' }}>{o.name}</span>
              <span className="pl">{o.slug}</span>
            </span>
            {o.id === currentOrg.id && <span className="ck"><Icon name="check" /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}
