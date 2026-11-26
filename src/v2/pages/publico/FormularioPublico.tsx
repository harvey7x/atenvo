/* O FORMULÁRIO QUE O CLIENTE ABRE (26/11) — <site>/f/<endereço>, sem login. Mostra as perguntas que o administrador montou em
   Automações › Formulários e, se o agendamento estiver ligado, os horários livres (dia → horário). Ao enviar, o cliente vira
   card no Kanban (e a reunião cai na Agenda); a página mostra a mensagem final. Celular primeiro. Dados: @/data/formularios. */
import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { erroDoEnvio, useEnviarFormulario, useFormularioPublico, type CampoForm } from '@/data/formularios';
import { IconeReviza } from '../../components/LogoReviza';
import './formularioPublico.css';

const tz = 'America/Sao_Paulo';
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
const foneMascara = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function FormularioPublico() {
  const { slug = '' } = useParams();
  const q = useFormularioPublico(slug);
  const enviar = useEnviarFormulario(slug);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [dia, setDia] = useState<string | null>(null);
  const [horario, setHorario] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState<{ mensagem: string; horario: string | null } | null>(null);
  const f = q.data;
  const dias = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of f?.agenda.horarios ?? []) { const k = chaveDia(h); m.set(k, [...(m.get(k) ?? []), h]); }
    return [...m.entries()];
  }, [f]);
  const diaAtivo = dia ?? dias[0]?.[0] ?? null;

  const mandar = async (e: FormEvent) => {
    e.preventDefault(); setErro('');
    if (!f) return;
    try { setPronto(await enviar.mutateAsync({ dados, horario })); window.scrollTo({ top: 0 }); }
    catch (x) { setErro(erroDoEnvio((x as Error).message, f.campos)); }
  };
  const campo = (c: CampoForm) => {
    const id = 'fp-' + c.chave; const val = dados[c.chave] ?? '';
    const mudar = (v: string) => { setDados((d) => ({ ...d, [c.chave]: v })); setErro(''); };
    const rot = <label htmlFor={id}>{c.rotulo}{c.obrigatorio ? <span className="fp-ob" aria-hidden> *</span> : <span className="fp-op"> (opcional)</span>}</label>;
    if (c.tipo === 'opcoes') return (
      <fieldset key={c.chave} className="fp-campo"><legend>{c.rotulo}{c.obrigatorio ? <span className="fp-ob" aria-hidden> *</span> : <span className="fp-op"> (opcional)</span>}</legend>
        <div className="fp-opcoes">
          {(c.opcoes ?? []).map((o) => (
            <label key={o} className={'fp-opcao' + (val === o ? ' on' : '')}><input type="radio" name={id} value={o} checked={val === o} onChange={() => mudar(o)} required={c.obrigatorio} />{o}</label>
          ))}
        </div>
      </fieldset>
    );
    return (
      <div key={c.chave} className="fp-campo">
        {rot}
        {c.tipo === 'area'
          ? <textarea id={id} rows={3} value={val} maxLength={1000} required={c.obrigatorio} onChange={(e) => mudar(e.target.value)} />
          : <input id={id} value={c.tipo === 'telefone' ? foneMascara(val) : val} required={c.obrigatorio} maxLength={c.tipo === 'telefone' ? 16 : 300}
              type={c.tipo === 'email' ? 'email' : c.tipo === 'numero' ? 'number' : c.tipo === 'data' ? 'date' : c.tipo === 'telefone' ? 'tel' : 'text'}
              inputMode={c.tipo === 'telefone' ? 'tel' : undefined} autoComplete={c.chave === 'nome' ? 'name' : c.tipo === 'telefone' ? 'tel' : c.tipo === 'email' ? 'email' : 'off'}
              placeholder={c.tipo === 'telefone' ? '(51) 99999-0000' : undefined}
              onChange={(e) => mudar(c.tipo === 'telefone' ? e.target.value.replace(/\D/g, '') : e.target.value)} />}
      </div>
    );
  };

  return (
    <main className="fp" data-formulario-publico>
      <div className="fp-cartao">
        <div className="fp-marca" aria-hidden><IconeReviza tam={28} /></div>
        {q.isLoading ? <p className="fp-info">Carregando…</p>
          : q.isError ? <p className="fp-info" role="alert">{(q.error as Error).message}</p>
          : !f ? (
            <div className="fp-fim"><h1>Formulário fechado</h1><p>Este formulário não está recebendo respostas agora.</p></div>
          ) : pronto ? (
            <div className="fp-fim" role="status">
              <span className="fp-ok" aria-hidden>✓</span>
              <h1>Recebido</h1>
              <p>{pronto.mensagem}</p>
              {pronto.horario && <p className="fp-marcado">Horário marcado: <b>{diaDe(pronto.horario)}, {horaDe(pronto.horario)}</b></p>}
            </div>
          ) : (
            <form onSubmit={(e) => void mandar(e)} noValidate={false}>
              <h1>{f.titulo}</h1>
              {f.descricao && <p className="fp-desc">{f.descricao}</p>}
              <div className="fp-campos">{f.campos.map(campo)}</div>
              {/* campo-isca: invisível para gente; robô preenche e o envio é ignorado */}
              <div className="fp-isca" aria-hidden><label>Site<input tabIndex={-1} autoComplete="off" value={dados._site ?? ''} onChange={(e) => setDados((d) => ({ ...d, _site: e.target.value }))} /></label></div>
              {f.agenda.ligado && (
                <fieldset className="fp-campo fp-agenda">
                  <legend>Escolha um horário{f.agenda.obrigatorio ? <span className="fp-ob" aria-hidden> *</span> : <span className="fp-op"> (opcional)</span>}</legend>
                  {dias.length === 0 ? <p className="fp-info">Nenhum horário livre agora. Envie assim mesmo que a equipe fala com você.</p> : (
                    <>
                      <div className="fp-dias" role="radiogroup" aria-label="Dia">
                        {dias.map(([k, hs]) => <button key={k} type="button" role="radio" aria-checked={diaAtivo === k} className={'fp-dia' + (diaAtivo === k ? ' on' : '')} onClick={() => setDia(k)}>{diaDe(hs[0])}</button>)}
                      </div>
                      <div className="fp-horas" role="radiogroup" aria-label="Horário">
                        {(dias.find(([k]) => k === diaAtivo)?.[1] ?? []).map((h) => (
                          <button key={h} type="button" role="radio" aria-checked={horario === h} className={'fp-hora' + (horario === h ? ' on' : '')} onClick={() => setHorario(horario === h ? null : h)}>{horaDe(h)}</button>
                        ))}
                      </div>
                      {horario && <p className="fp-escolha">Você escolheu <b>{diaDe(horario)}, {horaDe(horario)}</b> ({f.agenda.duracao_min ?? 30} min).</p>}
                    </>
                  )}
                </fieldset>
              )}
              {erro && <p className="fp-erro" role="alert">{erro}</p>}
              <button type="submit" className="fp-enviar" disabled={enviar.isPending}>{enviar.isPending ? 'Enviando…' : 'Enviar'}</button>
              <p className="fp-legal">Seus dados são usados só para a nossa equipe falar com você sobre o seu caso.</p>
            </form>
          )}
      </div>
    </main>
  );
}
