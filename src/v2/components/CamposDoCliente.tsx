/* CAMPOS DO CLIENTE no painel do WhatsApp (26/11, "igual" ao sistema que a Reviza usava antes). Os campos ligados em
   Configurações › Campos do cliente, na ordem; clicar no valor abre a edição ali mesmo (Enter grava, Esc desiste).
   O servidor confere o tipo (migration 110). Sem campos ligados, só o administrador vê o bloco (com o atalho para criar). */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { mostrarValor, useCampos, useSalvarValor, useValoresDoContato, validarValor, type Campo } from '@/data/camposPersonalizados';
import './camposDoCliente.css';

function Editor({ campo, inicial, aoGravar, aoSair, gravando }: { campo: Campo; inicial: string; aoGravar: (v: string) => void; aoSair: () => void; gravando: boolean }) {
  const [v, setV] = useState(inicial);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); aoSair(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aoGravar(v); }
  };
  if (campo.tipo === 'sim_nao') {
    return (
      <div className="cpc-sn" role="radiogroup" aria-label={campo.nome} onKeyDown={tecla}>
        {(['sim', 'nao'] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={v === o} className={v === o ? 'on' : undefined} disabled={gravando}
            onClick={() => { setV(o); aoGravar(o); }}>{o === 'sim' ? 'Sim' : 'Não'}</button>
        ))}
        {inicial && <button type="button" className="cpc-limpa" disabled={gravando} onClick={() => aoGravar('')}>Limpar</button>}
        <button type="button" className="cpc-limpa" onClick={aoSair}>Cancelar</button>
      </div>
    );
  }
  const comum = { ref, className: 'inp cpc-inp', disabled: gravando, onKeyDown: tecla, 'aria-label': campo.nome } as const;
  return (
    <div className="cpc-ed">
      {campo.tipo === 'lista'
        ? <select {...comum} value={v} onChange={(e) => setV(e.target.value)}>
          <option value="">Sem valor</option>
          {campo.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          {v && !campo.opcoes.includes(v) && <option value={v}>{v}</option>}
        </select>
        : <input {...comum} value={v} maxLength={500} onChange={(e) => setV(e.target.value)}
          type={campo.tipo === 'data' ? 'date' : campo.tipo === 'data_hora' ? 'datetime-local' : campo.tipo === 'email' ? 'email' : campo.tipo === 'telefone' ? 'tel' : 'text'}
          inputMode={campo.tipo === 'numero' ? 'decimal' : campo.tipo === 'inteiro' ? 'numeric' : undefined}
          placeholder={campo.tipo === 'inteiro' ? 'Ex.: 3' : campo.tipo === 'numero' ? 'Ex.: 2,5' : campo.tipo === 'telefone' ? '(51) 99999-0000' : campo.tipo === 'email' ? 'nome@exemplo.com' : 'Escreva aqui'} />}
      <div className="cpc-ed-ac">
        <button type="button" className="cpc-ok" disabled={gravando} onClick={() => aoGravar(v)}>{gravando ? 'Gravando…' : 'Gravar'}</button>
        <button type="button" className="cpc-limpa" onClick={aoSair}>Cancelar</button>
      </div>
    </div>
  );
}

export function CamposDoCliente({ contatoId }: { contatoId: string | null }) {
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  const nav = useNavigate();
  const camposQ = useCampos();
  const valoresQ = useValoresDoContato(contatoId);
  const salvar = useSalvarValor();
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  useEffect(() => { if (!salvo) return; const t = setTimeout(() => setSalvo(null), 1800); return () => clearTimeout(t); }, [salvo]);

  if (!contatoId || camposQ.isLoading) return null;
  const campos = (camposQ.data ?? []).filter((c) => c.ativo);
  if (!campos.length && !admin) return null;
  const valores = valoresQ.data ?? {};

  const gravar = async (c: Campo, bruto: string) => {
    setErro(null);
    const atual = valores[c.id]?.valor ?? '';
    if (bruto.trim() === atual) { setEditando(null); return; }
    if (bruto.trim()) { const r = validarValor(c, bruto); if ('erro' in r) { setErro({ id: c.id, texto: r.erro }); return; } }
    try { await salvar.mutateAsync({ contatoId, campoId: c.id, valor: bruto }); setEditando(null); setSalvo(c.id); }
    catch (x) { setErro({ id: c.id, texto: (x as Error).message }); }
  };

  return (
    <div className="ctx-b spot cpc" data-campos-cliente>
      <div className="ctx-t">Campos do cliente{admin && <button type="button" className="lk" onClick={() => nav('/config/campos')}>Configurar</button>}</div>
      {!campos.length && <p className="cpc-vazio">Nenhum campo ainda. Crie em Configurações › Campos do cliente (como o "Nome completo (RG)").</p>}
      <ul className="cpc-lista">
        {campos.map((c) => {
          const v = valores[c.id]?.valor ?? '';
          const ab = editando === c.id;
          return (
            <li key={c.id} className={ab ? 'ab' : undefined}>
              <span className="cpc-k">{c.nome}{salvo === c.id && <em className="cpc-salvo" role="status">Gravado</em>}</span>
              {ab
                ? <Editor campo={c} inicial={v} gravando={salvar.isPending} aoGravar={(x) => void gravar(c, x)} aoSair={() => { setEditando(null); setErro(null); }} />
                : <button type="button" className={'cpc-v' + (v ? '' : ' vazio')} title={v ? 'Mudar' : 'Preencher'} onClick={() => { setErro(null); setEditando(c.id); }}>
                  {v ? mostrarValor(c, v) : 'Preencher'}
                </button>}
              {erro?.id === c.id && <span className="cpc-erro" role="alert">{erro.texto}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
