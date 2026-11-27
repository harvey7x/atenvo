/* Selo da prévia (só no build de prévia): deixa claro que os dados são fictícios e tem o "Ver como"
   (11/11): escolher uma pessoa da equipe e ver o sistema como ela — os ambientes (Cobranças /
   Atendimento) e as telas do papel dela. A troca recarrega a página com a outra pessoa "logada" no
   cliente falso (supabasePrevia.ts expõe window.__previa). Fica no centro da barra do topo e some (sem
   tirar do lugar) quando algo cobre a barra: a Gestão em tela cheia, um modal/gaveta (véu), a paleta ⌘K
   e a foto ampliada. Em janela estreita ele não cobre a busca: vai para o vão entre a busca e os botões
   do topo e, se nem assim couber, encolhe (só "Prévia · Ver como"). */
import { ambientesDoPerfil, ROTULO_AMBIENTE } from '@/v2/data/modulos';
import { lerMoldura, salvarMoldura } from '@/v2/lib/molduraAlfa';
import { NOVIDADES, NOVIDADES_VERSAO } from './novidades';

const ESCONDE = '.gp-raiz.gp-cheia, .veu, .veu-drawer, .pal-veu, .fz-zoom, .ba-veu';
type PerfilPrevia = { id: string; nome: string; papel: string; ativo: boolean; modulos?: unknown };
type ApiPrevia = { perfis: () => PerfilPrevia[]; eu: () => string; verComo: (id: string) => void; restaurar: () => void };
const ROT_PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
const api = () => (window as unknown as { __previa?: ApiPrevia }).__previa;
const ambientesTxt = (p: PerfilPrevia) => ambientesDoPerfil(p.papel, p.modulos).map((a) => ROTULO_AMBIENTE[a]).join(' e ');

const CSS = `
#selo-previa{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;
  white-space:nowrap;padding:4px 5px 4px 12px;border-radius:999px;font:500 11px/1.2 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif;
  letter-spacing:.02em;color:rgba(244,131,73,.95);background:rgba(10,11,13,.78);border:1px solid rgba(244,131,73,.35);
  backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.25);transition:opacity .15s ease,visibility .15s}
body:has(${ESCONDE}) #selo-previa{opacity:0;visibility:hidden}
#selo-previa .sp-ver{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
  color:#f3f4f6;background:rgba(255,255,255,.08);font:inherit;letter-spacing:.01em}
#selo-previa .sp-ver:hover{background:rgba(255,255,255,.14)}
#selo-previa .sp-ver:focus-visible{outline:2px solid rgba(244,131,73,.8);outline-offset:2px}
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
#selo-previa .sp-item .sp-ok{grid-row:1/3;grid-column:2;align-self:center;color:rgba(244,131,73,.95);font-size:12px}
#selo-previa .sp-rodape{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;margin-top:4px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);
  color:rgba(255,255,255,.6);font:500 11.5px/1.3 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif}
#selo-previa .sp-rodape:hover{color:#fff}
#selo-previa .sp-ad{display:inline-flex;padding:2px;gap:2px;border-radius:999px;background:rgba(255,255,255,.06)}
#selo-previa .sp-ad button{all:unset;cursor:pointer;padding:3px 9px;border-radius:999px;color:rgba(255,255,255,.62);font:inherit;letter-spacing:.01em}
#selo-previa .sp-ad button:hover{color:#fff}
#selo-previa .sp-ad button[aria-pressed="true"]{color:#08090a;background:rgba(244,131,73,.95)}
#selo-previa .sp-ad button:focus-visible{outline:2px solid rgba(244,131,73,.8);outline-offset:2px}
#selo-previa.sp-curto .sp-ad{display:none}
#selo-previa.sp-curto .sp-fict,#selo-previa.sp-curto .sp-ver b{display:none}
@media (max-width:640px){#selo-previa .sp-fict,#selo-previa .sp-ver b,#selo-previa .sp-ad{display:none}#selo-previa{top:12px}#selo-previa .sp-menu{min-width:260px}}
@media (prefers-reduced-motion:reduce){#selo-previa{transition:none}}
#selo-previa .sp-nov{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;color:#08090a;
  background:rgba(244,131,73,.95);font:inherit;font-weight:650;letter-spacing:.01em}
#selo-previa .sp-nov:hover{background:#4C8DFF}
#selo-previa .sp-nov:focus-visible{outline:2px solid #fff;outline-offset:2px}
#selo-previa .sp-nov i{font-style:normal;display:inline-flex;min-width:16px;height:16px;align-items:center;justify-content:center;border-radius:999px;
  background:#08090a;color:#4C8DFF;font-size:10px}
#novidades-previa{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483001;width:min(440px,calc(100vw - 32px));
  max-height:min(78vh,640px);overflow:auto;padding:14px;border-radius:16px;background:rgba(16,17,20,.98);border:1px solid rgba(255,255,255,.1);
  box-shadow:0 24px 50px rgba(0,0,0,.5);color:#f3f4f6;font:400 12.5px/1.45 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif}
#novidades-previa[hidden]{display:none}
#novidades-previa .nv-cab{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
#novidades-previa .nv-cab b{display:block;font-size:14.5px;font-weight:650;color:#fff}
#novidades-previa .nv-cab span{color:rgba(255,255,255,.55);font-size:11.5px}
#novidades-previa .nv-x{all:unset;cursor:pointer;margin-left:auto;padding:2px 8px;border-radius:8px;color:rgba(255,255,255,.6);font-size:16px;line-height:1}
#novidades-previa .nv-x:hover{color:#fff;background:rgba(255,255,255,.08)}
#novidades-previa ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
#novidades-previa li{padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);display:grid;grid-template-columns:1fr auto;gap:3px 12px;align-items:start}
#novidades-previa li b{font-size:13px;font-weight:600;color:#fff}
#novidades-previa li em{grid-column:1;font-style:normal;font-size:11px;color:rgba(244,131,73,.95)}
#novidades-previa li p{grid-column:1 / -1;margin:3px 0 0;color:rgba(255,255,255,.72)}
#novidades-previa li button{all:unset;cursor:pointer;grid-row:1 / 3;grid-column:2;align-self:center;padding:6px 12px;border-radius:999px;
  background:rgba(244,131,73,.95);color:#08090a;font-weight:650;font-size:12px}
#novidades-previa li button:hover{background:#4C8DFF}
#novidades-previa li button:focus-visible,#novidades-previa .nv-x:focus-visible{outline:2px solid #fff;outline-offset:2px}
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
    // Antes / Depois da moldura preta (19/11; antes, do estilo Linear): o dono compara na hora; a escolha fica neste navegador
    const ad = document.createElement('span');
    ad.className = 'sp-ad';
    ad.setAttribute('role', 'group');
    ad.setAttribute('aria-label', 'Comparar o visual');
    const marcarAD = () => ad.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v === '1') === lerMoldura())));
    for (const [v, rot] of [['0', 'Antes'], ['1', 'Depois']] as const) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = v; b.textContent = rot;
      b.title = v === '1' ? 'Com a moldura preta' : 'Como estava antes da moldura preta';
      // recarrega: quem não escolheu tema abre no claro com a moldura e no escuro sem ela
      b.addEventListener('click', () => { if ((v === '1') === lerMoldura()) return; salvarMoldura(v === '1'); marcarAD(); location.reload(); });
      ad.append(b);
    }
    marcarAD();
    // NOVIDADES (25/11): o que há de novo nesta versão da prévia, com um botão que leva a cada lugar. Abre sozinha na 1ª vez de cada versão.
    const nov = document.createElement('button');
    nov.type = 'button'; nov.className = 'sp-nov';
    nov.setAttribute('aria-haspopup', 'dialog');
    nov.innerHTML = `Novidades <i>${NOVIDADES.length}</i>`;
    const painel = document.createElement('div');
    painel.id = 'novidades-previa'; painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'O que há de novo nesta prévia'); painel.hidden = true;
    const cabN = document.createElement('div'); cabN.className = 'nv-cab';
    const tit = document.createElement('div'); tit.innerHTML = '<b>O que há de novo</b><span>Toque em Ver para ir direto ao lugar. Dados fictícios.</span>';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'nv-x'; x.setAttribute('aria-label', 'Fechar'); x.textContent = '×';
    cabN.append(tit, x);
    const lista = document.createElement('ol');
    for (const n of NOVIDADES) {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = n.titulo;
      const em = document.createElement('em'); em.textContent = `${n.onde} · ${n.quando}`;
      const pp = document.createElement('p'); pp.textContent = n.texto;
      const ver = document.createElement('button'); ver.type = 'button'; ver.textContent = 'Ver';
      ver.addEventListener('click', () => { fecharNov(); location.hash = n.ir.replace(/^#/, ''); });
      li.append(b, ver, em, pp); lista.append(li);
    }
    painel.append(cabN, lista);
    const fecharNov = () => { painel.hidden = true; nov.setAttribute('aria-expanded', 'false'); try { localStorage.setItem('previa-novidades-visto', NOVIDADES_VERSAO); } catch { /* privado */ } };
    const abrirNov = () => { painel.hidden = false; nov.setAttribute('aria-expanded', 'true'); };
    nov.addEventListener('click', () => (painel.hidden ? abrirNov() : fecharNov()));
    x.addEventListener('click', fecharNov);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) fecharNov(); });
    document.addEventListener('pointerdown', (e) => { if (!painel.hidden && !painel.contains(e.target as Node) && !nov.contains(e.target as Node)) fecharNov(); });
    el.append(nov, tx, ad, bt, menu);
    document.body.append(el, painel);
    let visto = ''; try { visto = localStorage.getItem('previa-novidades-visto') ?? ''; } catch { /* privado */ }
    if (visto !== NOVIDADES_VERSAO) setTimeout(abrirNov, 1200);

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
