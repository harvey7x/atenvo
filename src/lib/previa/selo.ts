/* Selo da prévia (só no build de prévia): deixa claro que os dados são fictícios e tem o "Ver como"
   (11/11): escolher uma pessoa da equipe e ver o sistema como ela — os ambientes (Cobranças /
   Atendimento) e as telas do papel dela. A troca recarrega a página com a outra pessoa "logada" no
   cliente falso (supabasePrevia.ts expõe window.__previa). Fica no centro da barra do topo e some (sem
   tirar do lugar) quando algo cobre a barra: a Gestão em tela cheia, um modal/gaveta (véu), a paleta ⌘K
   e a foto ampliada. Em janela estreita ele não cobre a busca: vai para o vão entre a busca e os botões
   do topo e, se nem assim couber, encolhe (só "Prévia · Ver como"). */
import { ambientesDoPerfil, ROTULO_AMBIENTE } from '@/v2/data/modulos';

const ESCONDE = '.gp-raiz.gp-cheia, .veu, .veu-drawer, .pal-veu, .fz-zoom, .ba-veu';
type PerfilPrevia = { id: string; nome: string; papel: string; ativo: boolean; modulos?: unknown };
type ApiPrevia = { perfis: () => PerfilPrevia[]; eu: () => string; verComo: (id: string) => void; restaurar: () => void };
const ROT_PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
const api = () => (window as unknown as { __previa?: ApiPrevia }).__previa;
const ambientesTxt = (p: PerfilPrevia) => ambientesDoPerfil(p.papel, p.modulos).map((a) => ROTULO_AMBIENTE[a]).join(' e ');

const CSS = `
#selo-previa{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;
  white-space:nowrap;padding:4px 5px 4px 12px;border-radius:999px;font:500 11px/1.2 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif;
  letter-spacing:.02em;color:rgba(240,188,78,.95);background:rgba(10,11,13,.78);border:1px solid rgba(240,188,78,.35);
  backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.25);transition:opacity .15s ease,visibility .15s}
body:has(${ESCONDE}) #selo-previa{opacity:0;visibility:hidden}
#selo-previa .sp-ver{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
  color:#f3f4f6;background:rgba(255,255,255,.08);font:inherit;letter-spacing:.01em}
#selo-previa .sp-ver:hover{background:rgba(255,255,255,.14)}
#selo-previa .sp-ver:focus-visible{outline:2px solid rgba(240,188,78,.8);outline-offset:2px}
#selo-previa .sp-ver b{font-weight:650;color:#fff}
#selo-previa .sp-seta{width:10px;height:10px;opacity:.75}
#selo-previa .sp-menu{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);min-width:300px;max-height:min(70vh,520px);overflow:auto;
  padding:6px;border-radius:14px;background:rgba(16,17,20,.97);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 40px rgba(0,0,0,.45)}
#selo-previa .sp-menu[hidden]{display:none}
#selo-previa .sp-cab{padding:8px 10px 6px;color:rgba(255,255,255,.55);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}
#selo-previa .sp-item{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:1fr auto;gap:2px 10px;
  padding:8px 10px;border-radius:9px;color:#f3f4f6;font:500 12.5px/1.3 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif}
#selo-previa .sp-item:hover,#selo-previa .sp-item:focus-visible{background:rgba(255,255,255,.07)}
#selo-previa .sp-item i{grid-column:1;font-style:normal;font-size:11px;color:rgba(255,255,255,.5)}
#selo-previa .sp-item .sp-ok{grid-row:1/3;grid-column:2;align-self:center;color:rgba(240,188,78,.95);font-size:12px}
#selo-previa .sp-rodape{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;margin-top:4px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);
  color:rgba(255,255,255,.6);font:500 11.5px/1.3 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif}
#selo-previa .sp-rodape:hover{color:#fff}
#selo-previa.sp-curto .sp-fict,#selo-previa.sp-curto .sp-ver b{display:none}
@media (max-width:640px){#selo-previa .sp-fict,#selo-previa .sp-ver b{display:none}#selo-previa{top:12px}#selo-previa .sp-menu{min-width:260px}}
@media (prefers-reduced-motion:reduce){#selo-previa{transition:none}}
`;

export function montarSeloPrevia(): void {
  if (typeof document === 'undefined') return;
  const montar = () => {
    if (document.getElementById('selo-previa')) return;
    const estilo = document.createElement('style');
    estilo.id = 'selo-previa-estilo';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    const el = document.createElement('div');
    el.id = 'selo-previa';
    el.setAttribute('role', 'note');
    el.setAttribute('aria-label', 'Prévia do novo visual com dados fictícios');
    const tx = document.createElement('span');
    tx.innerHTML = 'Prévia<span class="sp-fict"> · dados fictícios</span>';
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'sp-ver';
    bt.setAttribute('aria-haspopup', 'menu');
    bt.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'sp-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    el.append(tx, bt, menu);
    document.body.appendChild(el);

    const seta = '<svg class="sp-seta" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const rotular = () => {
      const a = api();
      const eu = a?.perfis().find((p) => p.id === a.eu());
      bt.innerHTML = `Ver como <b>${eu ? eu.nome : '…'}</b>${seta}`;
      bt.title = eu ? `${eu.nome} · ${ROT_PAPEL[eu.papel] ?? eu.papel} · ${ambientesTxt(eu)} — trocar a pessoa` : 'Ver o sistema como outra pessoa da equipe';
    };
    const fechar = () => { menu.hidden = true; bt.setAttribute('aria-expanded', 'false'); };
    const abrir = () => {
      const a = api(); if (!a) return;
      const eu = a.eu();
      const perfis = a.perfis().filter((p) => p.ativo).sort((x, y) => (x.id === eu ? -1 : y.id === eu ? 1 : 0) || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
      menu.replaceChildren();
      const cab = document.createElement('div'); cab.className = 'sp-cab'; cab.textContent = 'Ver o sistema como'; menu.append(cab);
      for (const p of perfis) {
        const it = document.createElement('button');
        it.type = 'button'; it.className = 'sp-item'; it.setAttribute('role', 'menuitemradio'); it.setAttribute('aria-checked', String(p.id === eu));
        const nome = document.createElement('span'); nome.textContent = p.nome;
        const sub = document.createElement('i'); sub.textContent = `${ROT_PAPEL[p.papel] ?? p.papel} · ${ambientesTxt(p)}`;
        it.append(nome, sub);
        if (p.id === eu) { const ok = document.createElement('span'); ok.className = 'sp-ok'; ok.textContent = 'você'; it.append(ok); }
        it.addEventListener('click', () => { fechar(); if (p.id !== eu) a.verComo(p.id); });
        menu.append(it);
      }
      const rod = document.createElement('button'); rod.type = 'button'; rod.className = 'sp-rodape';
      rod.textContent = 'Voltar aos usuários de exemplo (desfaz o que foi criado na prévia)';
      rod.addEventListener('click', () => { fechar(); a.restaurar(); });
      menu.append(rod);
      menu.hidden = false; bt.setAttribute('aria-expanded', 'true');
      (menu.querySelector('.sp-item[aria-checked="true"]') as HTMLElement | null)?.focus();
    };
    bt.addEventListener('click', () => (menu.hidden ? abrir() : fechar()));
    // lugar do selo: no meio da tela se couber sem encostar na busca; senão no vão entre a busca e os
    // botões do topo; se o vão for pequeno, a versão curta
    const cabe = (x: number, w: number, de: number, ate: number) => x - w / 2 >= de + 12 && x + w / 2 <= ate - 12;
    const posicionar = () => {
      // o limite da esquerda: a busca (topo antigo) ou a trilha "ambiente / página" (topo da ALFA, 12/11)
      const busca = document.querySelector('.p-topbar .busca') ?? document.querySelector('.p-topbar .ba-trilha');
      const dir = document.querySelector('.p-topbar .top-dir');
      el.classList.remove('sp-curto');
      if (!busca || !dir || window.innerWidth <= 640) { el.style.left = '50%'; return; }
      const de = busca.getBoundingClientRect().right;
      const ate = dir.getBoundingClientRect().left;
      const meio = window.innerWidth / 2;
      const vao = de + (ate - de) / 2;
      for (const curto of [false, true]) {
        el.classList.toggle('sp-curto', curto);
        const w = el.offsetWidth;
        if (cabe(meio, w, de, ate)) { el.style.left = '50%'; return; }
        if (cabe(vao, w, de, ate)) { el.style.left = `${Math.round(vao)}px`; return; }
      }
      el.style.left = `${Math.round(vao)}px`;
    };
    window.addEventListener('resize', posicionar);
    window.addEventListener('hashchange', () => setTimeout(posicionar, 0));
    setInterval(posicionar, 700);
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !el.contains(e.target as Node)) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { fechar(); bt.focus(); } });
    rotular();
    setTimeout(() => { rotular(); posicionar(); }, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
  else montar();
}
