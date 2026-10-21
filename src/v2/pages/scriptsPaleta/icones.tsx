import type { ReactNode } from 'react';
import type { EtapaTipo } from '@/data/scripts';

/* Ícones da paleta — traço 1.8 em currentColor (mesma linguagem do inbox). */
const Svg = ({ children, fill }: { children: ReactNode; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{children}</svg>
);

export const IcBusca = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Svg>;
export const IcEstrela = () => (
  <Svg fill><path d="M12 3.4l2.6 5.26 5.8.84-4.2 4.1.99 5.78L12 16.65l-5.19 2.73.99-5.78-4.2-4.1 5.8-.84z" /></Svg>
);
/** mensagem de TEXTO = balão com linhas (o ≡ parecia menu) */
export const IcTexto = () => <Svg><path d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-6.2L7.5 20.3V17H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z" /><path d="M8 9h8M8 12.5h5" /></Svg>;
export const IcAudio = () => <Svg><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Svg>;
export const IcImagem = () => <Svg><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.5" /><path d="m5 18 4.5-4.5 3 3 3-3L19.5 18" /></Svg>;
export const IcVideo = () => <Svg><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.2 5-2.9v9.4l-5-2.9z" /></Svg>;
export const IcDocumento = () => <Svg><path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M13.5 3v5.5H19" /></Svg>;
/** navegação DENTRO do app (→); ↗ fica reservado para nova aba */
export const IcChevron = () => <Svg><path d="m9.5 6 6 6-6 6" /></Svg>;
export const IcVoltar = () => <Svg><path d="m14.5 6-6 6 6 6" /></Svg>;
export const IcAbaixo = () => <Svg><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /></Svg>;
/** número/chip por onde a mensagem sai */
export const IcCelular = () => <Svg><rect x="7" y="2.8" width="10" height="18.4" rx="2.4" /><path d="M11 17.6h2" /></Svg>;
export const IcEnter = () => <Svg><path d="M19 5v7a3 3 0 0 1-3 3H6" /><path d="m9.5 11.5-3.5 3.5 3.5 3.5" /></Svg>;
export const IcAlerta = () => <Svg><path d="M12 4.2 21 19.5H3z" /><path d="M12 10v4.2M12 17v.01" /></Svg>;
export const IcPessoa = () => <Svg><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5" /></Svg>;
export const IcMais = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const IcRelogio = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IcPasta = () => <Svg><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></Svg>;
export const IcLimpar = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;

export function IcTipo({ tipo }: { tipo: EtapaTipo }) {
  if (tipo === 'audio') return <IcAudio />;
  if (tipo === 'imagem') return <IcImagem />;
  if (tipo === 'video') return <IcVideo />;
  if (tipo === 'documento') return <IcDocumento />;
  return <IcTexto />;
}
