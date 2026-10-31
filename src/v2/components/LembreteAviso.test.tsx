// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvisoLembrete } from '@/data/lembretes';

/* O AVISO DO LEMBRETE (dono 30/10: "na hora ela me lembra"): a posição (acima do balão; no /whatsapp, acima do
   compositor — a MESMA regra do balão, importada), o cartão (a esfera, "Lembrete", o texto grande, "Marcado para
   13:00", "Lembrar em 10 min" e "Ok"; a pilha e "1 de 3" com vários; a esfera acesa enquanto ela fala), nada de
   emoji, o CSS no padrão do projeto (prefixo .lmb-, z-index 37, movimento só no bloco sem "reduzir movimento",
   o contínuo só no Completo) e o componente que não mostra nada sem lembrete. */

const estado = vi.hoisted(() => ({
  user: { id: 'u1', name: 'Matheus Ribeiro' } as { id: string; name: string } | null,
  org: { id: 'org1', name: 'CAF', slug: 'caf', role: 'admin' } as { id: string; name: string; slug: string; role: string } | null,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: estado.org }) }));

import { CartaoLembrete, LARGURA_AVISO, LembreteAviso, SELETOR_COM_SOM, SELETOR_OCUPADO, baseDoAviso } from './LembreteAviso';
import { baseDoBalao } from './AssistenteBalao';

// o MemoryRouter usa useLayoutEffect: no render de servidor o React só avisa (ruído) — como no AssistenteBalao.test
const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});

const T = Date.UTC(2026, 9, 31, 16, 0); // 13:00 em Brasília
const AVISO: AvisoLembrete = {
  chave: 'a@2026-10-31T16:00:00.000Z', id: 'a', texto: 'ligar para o João', quando: '2026-10-31T16:00:00.000Z', quandoMs: T, atrasado: false, demo: false,
};
const semComentarios = (html: string) => html.replace(/<!-- -->/g, '');
const cartao = (p: Partial<Parameters<typeof CartaoLembrete>[0]> = {}) =>
  semComentarios(renderToString(<CartaoLembrete aviso={AVISO} total={1} agora={T + 60_000} aoOk={() => undefined} aoAdiar={() => undefined} {...p} />));

describe('posição: acima do balão; no /whatsapp, acima do compositor', () => {
  const j657 = { altura: 657, largura: 1366 };
  const j900 = { altura: 900, largura: 1440 };
  const balao = { largura: 52, altura: 52 };

  it('fora do WhatsApp: logo acima do balão (20 + 52 + 12); sem o balão, no canto', () => {
    expect(LARGURA_AVISO).toBe(340);
    expect(baseDoAviso(j657, null, balao)).toBe(84);
    expect(baseDoAviso(j900, null, balao)).toBe(84);
    expect(baseDoAviso(j657, null, null)).toBe(20);
  });

  it('compositor por baixo (ficha fechada): acima do balão, que já está acima do compositor', () => {
    const comp = { top: 555, height: 86, left: 420, right: 1366 };
    expect(baseDoBalao(j657, comp, 52)).toBe(114);
    expect(baseDoAviso(j657, comp, balao)).toBe(114 + 52 + 12);
    expect(baseDoAviso(j657, comp, null)).toBe(114);
    expect(baseDoAviso(j900, { top: 790, height: 96, left: 420, right: 1440 }, balao)).toBe(122 + 52 + 12);
  });

  it('ficha do cliente aberta (o compositor acaba antes do canto): o balão fica no canto, o aviso (mais largo) sobe', () => {
    const comp = { top: 555, height: 86, left: 420, right: 1050 };
    expect(baseDoBalao(j657, comp, 52)).toBe(20);
    expect(baseDoAviso(j657, comp, balao)).toBe(114); // acima do compositor; o balão (20..72) fica abaixo
  });

  it('janela estreita: a largura do aviso encolhe (100vw − 32 px) e a regra usa a largura real', () => {
    const j = { altura: 700, largura: 360 };
    // o aviso vai de 12 a 340 px (328 de largura, não 340): o compositor que acaba em 10 px não passa por baixo dele
    expect(baseDoAviso(j, { top: 600, height: 80, left: 0, right: 10 }, null)).toBe(20);
    // o que acaba em 30 px passa: o aviso sobe acima dele (700 − 600 + 12)
    expect(baseDoAviso(j, { top: 600, height: 80, left: 0, right: 30 }, null)).toBe(112);
  });
});

describe('o cartão', () => {
  it('a esfera, "Lembrete", o texto grande, "Marcado para 13:00", "Lembrar em 10 min" e "Ok" — nessa ordem', () => {
    const h = cartao();
    const ordem = ['class="lmb-esfera"', '>Lembrete<', '>Ligar para o João<', '>Marcado para 13:00<', '>Lembrar em 10 min<', '>Ok<'];
    const pos = ordem.map((t) => h.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(h).toContain('role="dialog"');
    expect(h).toContain('aria-modal="false"');
    expect(h).toContain('role="alert"');
    expect(h).toContain('Lembrete: Ligar para o João. Marcado para 13:00.');
    expect(h).toContain('data-tam="g"');
  });

  it('um só: sem pilha e sem contador; três: duas bordas atrás e "1 de 3"; dois: uma borda e "1 de 2"', () => {
    const um = cartao();
    expect(um).not.toContain('lmb-camada');
    expect(um).not.toContain('lmb-conta');
    const tres = cartao({ total: 3 });
    expect(tres.match(/lmb-camada /g)).toHaveLength(2);
    expect(tres).toContain('>1 de 3<');
    const dois = cartao({ total: 2 });
    expect(dois.match(/lmb-camada /g)).toHaveLength(1);
    expect(dois).toContain('>1 de 2<');
  });

  it('ela falando: a esfera acende (data-falando); parada, sem o atributo', () => {
    expect(cartao({ falando: true })).toContain('data-falando="sim"');
    expect(cartao()).not.toContain('data-falando');
  });

  it('atrasado de ontem: "Marcado para ontem, 22:00"; texto longo: letra menor (sem cortar)', () => {
    const ontem = Date.UTC(2026, 10, 1, 1, 0); // 22:00 de sábado em Brasília
    const h = cartao({ aviso: { ...AVISO, quandoMs: ontem, atrasado: true }, agora: Date.UTC(2026, 10, 1, 11, 0) });
    expect(h).toContain('>Marcado para ontem, 22:00<');
    expect(h).toContain('data-atrasado="sim"');
    const longo = 'retornar para a Dona Terezinha sobre a portabilidade: confirmar se o extrato novo chegou, conferir o valor das parcelas';
    expect(cartao({ aviso: { ...AVISO, texto: longo } })).toContain('data-tam="p"');
  });

  it('zero emoji no cromo', () => {
    const h = cartao({ total: 3, falando: true });
    expect(/\p{Extended_Pictographic}/u.test(h.replace(/<[^>]*>/g, ''))).toBe(false);
  });
});

describe('o componente montado', () => {
  it('sem lembrete na hora (o render de servidor não roda a agenda): não mostra nada', () => {
    const h = renderToString(<MemoryRouter initialEntries={['/whatsapp']}><LembreteAviso /></MemoryRouter>);
    expect(h).toBe('');
  });

  it('montado no shell pelo contrato: ao lado do balão, espera o bom dia e só busca com a voz liberada (hoje só o Matheus)', () => {
    const shell = readFileSync(join(__dirname, '..', 'shell', 'AppShellV2.tsx'), 'utf8');
    expect(shell).toContain("import { LembreteAviso } from '../components/LembreteAviso';");
    expect(shell).toContain("import { AssistenteBalao, vozLiberadaPara } from '../components/AssistenteBalao';");
    const balao = shell.indexOf('<AssistenteBalao oculto={bomDia !== null} />');
    const aviso = shell.indexOf('<LembreteAviso oculto={bomDia !== null} ativo={vozLiberadaPara(user?.id)} />');
    expect(balao).toBeGreaterThan(0);
    expect(aviso).toBeGreaterThan(balao);
    expect(shell.slice(balao, aviso).split('\n')).toHaveLength(3); // logo depois do balão (só o comentário no meio)
    expect(shell.match(/<LembreteAviso /g)).toHaveLength(1);
  });

  it('espera o bom dia, o cartão de voz e a tela cheia da Central de Avisos (modal por cima de tudo)', () => {
    expect(SELETOR_OCUPADO.split(',').map((s) => s.trim()).sort()).toEqual(['.ast-voz', '.bd-veu', '.gva-tk']);
  });

  it('a outra aba (a que fala) só espera SOM: a conversa de voz viva ou o bom dia falando — nunca tela parada', () => {
    expect(SELETOR_COM_SOM.split(',').map((s) => s.trim()).sort()).toEqual([
      '.ast-voz:not([data-fase="erro"]):not([data-fase="encerrada"])', '.bd-veu.bd-fase-falando', '.bd-veu.bd-fase-voltando',
    ]);
    // as classes vêm do bom dia (BomDia.tsx: bd-veu bd-fase-${fase}; fases boot · pronta · falando · voltando · fim)
    const bomDia = readFileSync(join(__dirname, 'BomDia.tsx'), 'utf8');
    expect(bomDia).toContain('className={`bd-veu bd-fase-${fase}');
    expect(bomDia).toMatch(/type Fase = 'boot' \| 'pronta' \| 'falando' \| 'voltando' \| 'fim';/);
    // o cartão de voz (AssistenteVoz.tsx) é a .ast-voz com data-fase = a fase da conversa (erro e encerrada: sem microfone)
    const voz = readFileSync(join(__dirname, 'AssistenteVoz.tsx'), 'utf8');
    expect(voz).toMatch(/className="ast-voz"[\s\S]{0,200}data-fase=\{fase\}/);
    const fases = readFileSync(join(__dirname, '..', 'lib', 'assistenteVoz.ts'), 'utf8');
    expect(fases).toContain("export type FaseVoz = 'conectando' | 'ouvindo' | 'consultando' | 'falando' | 'encerrada' | 'erro';");
  });

  it('sem pessoa logada ou sem empresa: nada (nem busca)', () => {
    estado.user = null;
    expect(renderToString(<MemoryRouter><LembreteAviso /></MemoryRouter>)).toBe('');
    estado.user = { id: 'u1', name: 'Matheus Ribeiro' };
    estado.org = null;
    expect(renderToString(<MemoryRouter><LembreteAviso /></MemoryRouter>)).toBe('');
    estado.org = { id: 'org1', name: 'CAF', slug: 'caf', role: 'admin' };
  });
});

describe('lembrete.css no padrão do projeto', () => {
  const css = readFileSync(join(__dirname, 'lembrete.css'), 'utf8');
  const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('toda classe é .lmb- (fora o escopo .v2), tudo dentro de .v2', () => {
    const classes = new Set([...semComentario.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    classes.delete('v2');
    expect([...classes].filter((c) => !c.startsWith('lmb-'))).toEqual([]);
    const seletores = [...semComentario.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]+\{/g, '')
      .matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).flatMap((s) => s.split(',').map((x) => x.trim())).filter(Boolean);
    expect(seletores.filter((s) => !/(^|\s)\.v2\s/.test(s))).toEqual([]);
  });

  it('z-index 37: acima do balão (35) e do cartão de voz (36), abaixo do toast de mensagem (40)', () => {
    expect(semComentario).toMatch(/\.lmb-caixa\s*\{[^}]*z-index:\s*37/);
  });

  it('o topo para abaixo do cabeçalho da conversa (140 px, a regra do cartão de voz): o texto rola, os botões ficam', () => {
    // compositor alto (respondendo + 6 linhas) em 1366×657: sem isto o cartão subia sobre Transferir/Arquivar/Dados
    expect(semComentario).toMatch(/\.v2 \.lmb-aviso \{[^}]*max-height: max\(180px, calc\(100vh - var\(--lmb-base, 84px\) - 140px\)\)/);
    expect(semComentario).toMatch(/\.v2 \.lmb-texto \{[^}]*flex: 0 1 auto; min-height: 0; overflow-y: auto/);
    for (const parte of ['lmb-topo', 'lmb-hora', 'lmb-acoes']) expect(semComentario).toMatch(new RegExp(`\\.v2 \\.${parte} \\{[^}]*flex: none`));
  });

  it('Leve (o padrão do produto): sem backdrop-filter, fundo opaco', () => {
    const leve = semComentario.match(/:root\[data-perf="lite"\] \.v2 \.lmb-aviso \{([^}]*)\}/)?.[1] ?? '';
    expect(leve).toMatch(/(^|[;\s])backdrop-filter: none/);
    expect(leve).toMatch(/-webkit-backdrop-filter: none/);
    expect(leve).toMatch(/linear-gradient\(180deg, #[0-9A-F]{6}, #[0-9A-F]{6}\)/i);
  });

  it('contraste AA: o texto mais apagado ("Marcado para 13:00", "1 de 3") com alfa ≥ .54 sobre o vidro escuro', () => {
    const alfa = Number(semComentario.match(/--lmb-txt-3: rgba\(237, 237, 239, ([\d.]+)\)/)?.[1]);
    expect(alfa).toBeGreaterThanOrEqual(0.54);
  });

  it('movimento só sem "reduzir movimento", com html:root[data-perf] e !important; o contínuo só no Completo', () => {
    const fora = semComentario.split('@media (prefers-reduced-motion: no-preference)')[0];
    expect(fora).not.toMatch(/(?<![-\w])(animation|transition)\s*:/);
    const dentro = semComentario.split('@media (prefers-reduced-motion: no-preference)')[1].split('@keyframes')[0];
    const regras = [...dentro.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(regras.length).toBeGreaterThan(0);
    for (const [, sel, corpo] of regras) {
      for (const s of sel.split(',')) expect(s.trim()).toMatch(/^html:root\[data-perf(="full")?\] \.v2 /);
      expect(corpo).toMatch(/!important/);
      if (/infinite/.test(corpo)) expect(sel).toContain('[data-perf="full"]');
    }
  });
});
