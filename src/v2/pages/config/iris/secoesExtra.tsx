/* AS PARTES NOVAS DA TELA DAS IAs (26/11, "igual" ao sistema que a Reviza usava antes — Agentes › Configurar, Roteiro,
   Regras, FAQ, Catálogo, Copiloto e Senhas de edição):
     SecInicio       quanto tempo ela espera o cliente terminar de digitar e as frases que fazem ela começar
     SecRoteiro      o roteiro e as regras da empresa, em texto livre (o que a Reviza escreveu lá vem pronto na "Bia")
     SecOutras       principal ou secundária, quando a secundária recebe a conversa e para quais a principal pode passar
     BlocoAudioAssinatura  áudio (nunca · sempre · igual ao cliente) e a assinatura no fim das mensagens
     BlocoCatalogo   os produtos e serviços que ela pode oferecer (Configurações › Produtos e serviços)
     SecCopiloto     a IA da empresa lê a configuração da tela e sugere trechos prontos (nada é aplicado sozinho)
     BlocoSenha · PortaoSenha  a senha de edição da versão e o pedido da senha antes de mudar
   Tudo mora em IrisConfig (data/config/iris.ts) e é salvo pelo "Salvar" da tela, como o resto. */
import { useRef, useState } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec } from '../../../components';
import { type IrisConfig, type VersaoIris } from '../../../data/config/iris';
import { temRecurso } from '../../../data/config/recursos';
import { ABERTA_MIN, destravarEdicao, fecharEdicao, useDefinirSenhaIris, useRemoverSenhaIris, type ResultadoSenhaIa } from '@/data/irisSenha';
import { brl, useProdutos } from '@/data/financeiro';
import { traduzErroIa, useCopilotoIris, type FalaCopiloto } from '@/data/iaPropria';
import { Bloco, Escolha, Etiquetas, Liga, Numero, Texto, TextoLongo } from './campos';
import { Ic } from './icones';

type Mudar = (fn: (c: IrisConfig) => IrisConfig) => void;
interface P { c: IrisConfig; set: Mudar }
const ESPERAS = [0, 15, 20, 30, 45, 60];
const MSG_SENHA: Record<Exclude<ResultadoSenhaIa, 'ok'>, string> = { errada: 'Senha errada.', travado: 'Muitas tentativas erradas. Espere 15 minutos.' };

/* ------------------------------ quando ela começa ------------------------------ */
export function SecInicio({ c, set }: P) {
  const i = c.inicio;
  const mud = (p: Partial<IrisConfig['inicio']>) => set((x) => ({ ...x, inicio: { ...x.inicio, ...p } }));
  return (
    <>
      <Bloco titulo="Esperar antes de responder" desc="Quanto tempo ela espera o cliente terminar de digitar. Quem manda três mensagens seguidas recebe uma resposta só.">
        <div className="irs-esperas" role="radiogroup" aria-label="Esperar antes de responder">
          {ESPERAS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={i.esperaSeg === s} className={'irs-uf' + (i.esperaSeg === s ? ' on' : '')} onClick={() => mud({ esperaSeg: s })}>{s ? `${s} s` : 'Na hora'}</button>
          ))}
        </div>
        <Numero rotulo="Ou outro tempo" valor={i.esperaSeg} min={0} max={180} sufixo="segundos" aoMudar={(n) => mud({ esperaSeg: n })} />
      </Bloco>
      <Bloco titulo="Quando ela começa a atender" desc="As frases que fazem ela começar a conversa, como as dos anúncios. Ela compara sem acento e sem maiúscula, e pedaço de palavra também vale (abusiv pega abusivo e abusiva).">
        <Liga titulo="Só começa quando a primeira mensagem tiver uma destas frases" ligado={i.soComGatilho} aoMudar={(v) => mud({ soComGatilho: v })}
          desc={i.soComGatilho ? 'Quem escrever outra coisa fica para a equipe, sem resposta da IA.' : 'Desligado: ela começa com qualquer mensagem.'} />
        <Etiquetas rotulo={<>Frases ({i.gatilhos.length})</>} valores={i.gatilhos} aoMudar={(v) => mud({ gatilhos: v.slice(0, 200) })} placeholder="Ex.: quero atendimento (Enter ou vírgula para pôr)"
          dica={i.gatilhos.length > 0 && i.gatilhos.some((g) => ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'quero'].includes(g.toLowerCase()))
            ? 'Atenção: "oi", "olá", "bom dia" e "quero" pegam quase qualquer conversa, inclusive de quem não veio do anúncio.' : undefined} />
      </Bloco>
    </>
  );
}

/* ------------------------------ roteiro e regras ------------------------------ */
export function SecRoteiro({ c, set }: P) {
  const r = c.roteiro;
  const mud = (p: Partial<IrisConfig['roteiro']>) => set((x) => ({ ...x, roteiro: { ...x.roteiro, ...p } }));
  return (
    <>
      <div className="irs-nota">
        <b>O jeito da empresa, em texto livre.</b> O roteiro diz o que ela faz do começo ao fim; as regras valem para a conversa inteira. Ela segue os dois junto com as outras partes desta tela. Linhas como "Etiqueta: RG", "Etapa: COMERCIAL REVIZA › LEAD NOVO", "Campo: Nome completo (RG)", "Mídia: agibank" e "Agenda: Agendar reunião" são ações que ela faz no ponto certo.
      </div>
      <Bloco titulo="Roteiro" desc={`O que ela faz, do começo ao fim. ${r.texto.length.toLocaleString('pt-BR')} de 30.000 letras.`}>
        <TextoLongo rotulo="Roteiro" valor={r.texto} aoMudar={(v) => mud({ texto: v })} linhas={18} max={30000}
          placeholder={'0. Ação inicial\n1. Quem você é\n2. Como falar\n3. Etapas do atendimento\n…'} />
      </Bloco>
      <Bloco titulo="Regras" desc={`O tom, o que ela nunca diz e quando um cliente é qualificado ou não. ${r.regras.length.toLocaleString('pt-BR')} de 30.000 letras.`}>
        <TextoLongo rotulo="Regras" valor={r.regras} aoMudar={(v) => mud({ regras: v })} linhas={10} max={30000} placeholder="Ex.: nunca responda dúvidas jurídicas; mensagens curtas, de até 2 frases…" />
      </Bloco>
    </>
  );
}

/* ------------------------------ áudio e assinatura (na parte "Quem ela é") ------------------------------ */
export function BlocoAudioAssinatura({ c, set }: P) {
  return (
    <Bloco titulo="Áudio e assinatura" desc="Como lá: nunca em áudio, sempre em áudio, ou em áudio só quando o cliente manda áudio.">
      <Escolha rotulo="Áudio" valor={c.audioModo.modo}
        aoMudar={(v) => set((x) => ({ ...x, audioModo: { modo: v }, tom: { ...x.tom, audio: v !== 'desligado' } }))}
        opcoes={[
          { valor: 'desligado', rotulo: 'Desligado', desc: 'Ela responde só por texto.' },
          { valor: 'sempre', rotulo: 'Sempre em áudio', desc: 'Toda resposta vira nota de voz. Links, endereço e listas vão também por escrito.' },
          { valor: 'igual_ao_lead', rotulo: 'Igual ao cliente', desc: 'Áudio só quando o cliente manda áudio.' },
        ]} />
      <Liga titulo="Assinatura no fim das mensagens" desc="Uma linha curta depois do texto, como faz um atendente." ligado={c.assinatura.ativa} aoMudar={(v) => set((x) => ({ ...x, assinatura: { ...x.assinatura, ativa: v } }))} />
      {c.assinatura.ativa && (
        <div className="irs-sub">
          <Texto rotulo="Assinatura" valor={c.assinatura.texto} max={80} aoMudar={(v) => set((x) => ({ ...x, assinatura: { ...x.assinatura, texto: v } }))}
            dica={<>Pode usar {'{assistente}'} e {'{empresa}'}. O cliente lê: <b>{c.assinatura.texto.replace(/\{assistente\}/g, c.identidade.assistente || 'Iris').replace(/\{empresa\}/g, c.identidade.empresa || 'Reviza')}</b></>} />
        </div>
      )}
    </Bloco>
  );
}

/* ------------------------------ o catálogo (na parte "O que oferece") ------------------------------ */
export function BlocoCatalogo({ c, set }: P) {
  const ligado = temRecurso('financeiro');
  const pq = useProdutos(ligado);
  const produtos = (pq.data ?? []).filter((p) => p.ativo || c.catalogo.produtoIds.includes(p.id));
  const mud = (p: Partial<IrisConfig['catalogo']>) => set((x) => ({ ...x, catalogo: { ...x.catalogo, ...p } }));
  if (!ligado) return null;
  return (
    <Bloco titulo="Catálogo de produtos e serviços" desc="Os itens de Configurações › Produtos e serviços que ela pode oferecer na conversa, com o valor de cada um.">
      <Liga titulo="Usar o catálogo nesta IA" desc="Ela só oferece um item quando fizer sentido na conversa." ligado={c.catalogo.usar} aoMudar={(v) => mud({ usar: v })} />
      {c.catalogo.usar && (
        <div className="irs-sub">
          {produtos.length === 0 ? <p className="irs-vazio">Nenhum produto cadastrado. Cadastre em Configurações › Produtos e serviços.</p> : (
            <div className="irs-catalogo" role="group" aria-label="Itens que ela pode oferecer">
              {produtos.map((p) => {
                const on = c.catalogo.produtoIds.includes(p.id);
                return (
                  <label key={p.id} className={'irs-cat' + (on ? ' on' : '')}>
                    <input type="checkbox" checked={on} onChange={(e) => mud({ produtoIds: e.target.checked ? [...c.catalogo.produtoIds, p.id] : c.catalogo.produtoIds.filter((x) => x !== p.id) })} />
                    <span><b>{p.nome}</b><small>{brl(p.valor)}{p.descricao ? ` · ${p.descricao}` : ''}</small></span>
                  </label>
                );
              })}
            </div>
          )}
          <Numero rotulo="Itens por resposta, no máximo" valor={c.catalogo.maxPorResposta} min={1} max={4} aoMudar={(n) => mud({ maxPorResposta: n })} />
        </div>
      )}
    </Bloco>
  );
}

/* ------------------------------ outras IAs (principal e secundárias) ------------------------------ */
export function SecOutras({ c, set, v, versoes }: P & { v: VersaoIris; versoes: VersaoIris[] }) {
  const p = c.papel;
  const mud = (x: Partial<IrisConfig['papel']>) => set((y) => ({ ...y, papel: { ...y.papel, ...x } }));
  const outras = versoes.filter((o) => o.id !== v.id);
  const secundarias = outras.filter((o) => o.config.papel.tipo === 'secundaria');
  return (
    <>
      <div className="irs-nota">
        <b>Como lá: a principal atende o número; as secundárias não têm número próprio.</b> A secundária só entra quando a principal passa a conversa para ela — por exemplo, uma IA só para quem quer ir ao escritório, ou só para representante legal.
      </div>
      <Bloco titulo="O papel desta IA">
        <Escolha rotulo="Esta IA é" valor={p.tipo} aoMudar={(t) => mud({ tipo: t })}
          opcoes={[{ valor: 'principal', rotulo: 'Principal', desc: 'Atende os números ligados a ela.' }, { valor: 'secundaria', rotulo: 'Secundária', desc: 'Sem número: atende quando outra IA passa a conversa.' }]} />
      </Bloco>
      {p.tipo === 'secundaria' ? (
        <Bloco titulo="Quando ela recebe a conversa" desc="A principal passa a conversa quando o cliente fala de um destes assuntos.">
          <TextoLongo rotulo="Para quem ela é" valor={p.descricao} aoMudar={(d) => mud({ descricao: d })} linhas={2} max={600} placeholder="Ex.: clientes que querem ser atendidos no escritório, em Porto Alegre." />
          <Etiquetas rotulo="Frases do cliente que fazem passar para ela" valores={p.quandoReceber} aoMudar={(q) => mud({ quandoReceber: q.slice(0, 100) })} placeholder="Ex.: quero ir pessoalmente" />
          {p.quandoReceber.length === 0 && !p.descricao.trim() && <p className="irs-erro">Diga para quem ela é ou ponha ao menos uma frase: sem isso nenhuma principal passa conversa para ela.</p>}
        </Bloco>
      ) : (
        <Bloco titulo="Para quais IAs ela pode passar a conversa" desc="Só aparecem aqui as IAs marcadas como secundárias.">
          {secundarias.length === 0 ? <p className="irs-vazio">Nenhuma IA secundária ainda. Crie uma IA nova e marque "Secundária" nela.</p> : secundarias.map((o) => {
            const on = p.podePassarPara.includes(o.id);
            return (
              <Liga key={o.id} titulo={o.nome} ligado={on} aoMudar={(x) => mud({ podePassarPara: x ? [...p.podePassarPara, o.id] : p.podePassarPara.filter((y) => y !== o.id) })}
                desc={o.config.papel.descricao || (o.config.papel.quandoReceber.length ? `Quando o cliente fala: ${o.config.papel.quandoReceber.slice(0, 6).join(', ')}${o.config.papel.quandoReceber.length > 6 ? '…' : ''}` : 'Sem assunto definido ainda.')} />
            );
          })}
        </Bloco>
      )}
    </>
  );
}

/* ------------------------------ copiloto ------------------------------ */
export function SecCopiloto({ v, c }: { v: VersaoIris; c: IrisConfig }) {
  const copiloto = useCopilotoIris();
  const [falas, setFalas] = useState<FalaCopiloto[]>([]);
  const [txt, setTxt] = useState('');
  const [erro, setErro] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const disponivel = temRecurso('ia-propria');
  const perguntar = async (pergunta: string) => {
    const q = pergunta.trim(); if (q.length < 2) return;
    setErro(''); setTxt('');
    const antes = falas; setFalas([...antes, { de: 'eu', texto: q }]);
    try { const r = await copiloto.mutateAsync({ agenteId: v.id, pergunta: q, historico: antes, config: c }); setFalas((f) => [...f, { de: 'copiloto', texto: r }]); }
    catch (x) { setErro(traduzErroIa(x)); setFalas(antes); setTxt(q); }
    requestAnimationFrame(() => fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };
  const copiar = (t: string) => { void navigator.clipboard?.writeText(t).catch(() => undefined); };
  return (
    <>
      <div className="irs-nota">
        <b>O seu consultor de roteiro.</b> A IA da empresa (a chave de Integrações › Inteligência artificial) lê o que está na tela agora — o roteiro, as regras, as perguntas, as frases de início — e explica, sugere e entrega trechos prontos para copiar. Nada muda sozinho: você cola o que quiser e salva.
      </div>
      {!disponivel ? <p className="irs-vazio">O copiloto entra junto com a IA da própria empresa (Integrações › Inteligência artificial).</p> : (
        <div className="irs-copiloto">
          <div className="irs-cop-fio" aria-live="polite">
            {falas.length === 0 && (
              <div className="irs-cop-vazio">
                <span className="irs-cop-ic"><Ic nome="copiloto" tam={20} /></span>
                <b>Peça uma revisão</b>
                <div className="irs-cop-ideias">
                  {['Revise o roteiro e aponte o que se contradiz', 'Os gatilhos pegam conversas que não são da campanha?', 'Escreva uma resposta melhor para quem acha que é golpe', 'O que falta preencher para ela atender bem?'].map((s) => (
                    <button key={s} type="button" className="irs-cop-ideia" disabled={copiloto.isPending} onClick={() => void perguntar(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {falas.map((f, n) => (
              <div key={n} className={'irs-cop-fala ' + f.de}>
                {f.de === 'copiloto' ? <Resposta texto={f.texto} aoCopiar={copiar} /> : <p>{f.texto}</p>}
              </div>
            ))}
            {copiloto.isPending && <div className="irs-cop-fala copiloto pensando"><p>Lendo a configuração…</p></div>}
            <div ref={fim} />
          </div>
          {erro && <p className="irs-erro" role="alert">{erro}</p>}
          <form className="irs-cop-form" onSubmit={(e) => { e.preventDefault(); void perguntar(txt); }}>
            <textarea className="inp" rows={2} value={txt} maxLength={1500} placeholder="Pergunte ou peça uma revisão" aria-label="Pergunta para o copiloto"
              onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void perguntar(txt); } }} />
            <div className="irs-cop-acoes">
              {falas.length > 0 && <BotaoSec mini type="button" onClick={() => { setFalas([]); setErro(''); }}>Limpar</BotaoSec>}
              <BotaoPrimario type="submit" disabled={copiloto.isPending || txt.trim().length < 2}>{copiloto.isPending ? 'Pensando…' : 'Perguntar'}</BotaoPrimario>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** a resposta do copiloto: texto e os trechos prontos (entre ```), cada um com "Copiar" */
function Resposta({ texto, aoCopiar }: { texto: string; aoCopiar: (t: string) => void }) {
  const partes = texto.split(/```[a-z]*\n?/i);
  const [copiado, setCopiado] = useState<number | null>(null);
  return (
    <>
      {partes.map((p, n) => (n % 2 === 1
        ? <div key={n} className="irs-cop-trecho"><pre>{p.trim()}</pre><button type="button" className="irs-link" onClick={() => { aoCopiar(p.trim()); setCopiado(n); }}>{copiado === n ? 'Copiado' : 'Copiar o trecho'}</button></div>
        : p.trim() && <p key={n}>{p.trim()}</p>))}
    </>
  );
}

/* ------------------------------ senha de edição (em Avançado) ------------------------------ */
export function BlocoSenha({ v, protegida, aviso }: { v: VersaoIris; protegida: { definidaEm: string; definidaPor: string | null } | null; aviso: (tom: 'ok' | 'erro', t: string) => void }) {
  const definir = useDefinirSenhaIris();
  const remover = useRemoverSenhaIris();
  const [modo, setModo] = useState<'criar' | 'trocar' | 'tirar' | null>(null);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState('');
  const fechar = () => { setModo(null); setAtual(''); setNova(''); setConf(''); setErro(''); };
  const ir = async () => {
    setErro('');
    try {
      if (modo === 'tirar') {
        const r = await remover.mutateAsync({ agenteId: v.id, senha: atual });
        if (r !== 'ok') { setErro(MSG_SENHA[r]); return; }
        aviso('ok', `"${v.nome}" ficou sem senha de edição.`); fechar(); return;
      }
      if (nova.length < 6) { setErro('A senha precisa de pelo menos 6 letras ou números.'); return; }
      if (nova !== conf) { setErro('As duas senhas não são iguais.'); return; }
      const r = await definir.mutateAsync({ agenteId: v.id, senha: nova, atual: modo === 'trocar' ? atual : undefined });
      if (r !== 'ok') { setErro(r === 'errada' ? 'A senha atual está errada.' : MSG_SENHA[r]); return; }
      aviso('ok', modo === 'criar' ? `"${v.nome}" agora pede a senha para mudar. A edição fica aberta por ${ABERTA_MIN} minutos nesta aba.` : 'Senha de edição trocada.'); fechar();
    } catch (x) { setErro((x as Error).message); }
  };
  if (!temRecurso('iris-senha')) return null;
  const ocupado = definir.isPending || remover.isPending;
  return (
    <Bloco titulo="Senha de edição" desc="Só quem souber a senha muda esta IA. Protege só a edição: não substitui o login e não impede a IA de atender.">
      <div className="irs-chave">
        <BadgeStatus tom={protegida ? 'ok' : 'neutro'}>{protegida ? `Protegida desde ${new Date(protegida.definidaEm).toLocaleDateString('pt-BR')}${protegida.definidaPor ? ` por ${protegida.definidaPor}` : ''}` : 'Sem senha'}</BadgeStatus>
        {!modo && (protegida
          ? <><BotaoSec mini onClick={() => setModo('trocar')}>Trocar a senha</BotaoSec><BotaoSec mini onClick={() => setModo('tirar')}>Tirar a senha</BotaoSec><BotaoSec mini onClick={() => fecharEdicao(v.id)}>Fechar a edição agora</BotaoSec></>
          : <BotaoSec mini onClick={() => setModo('criar')}>Pôr uma senha</BotaoSec>)}
      </div>
      {modo && (
        <form className="irs-senha-form" onSubmit={(e) => { e.preventDefault(); void ir(); }}>
          {modo !== 'criar' && <label className="irs-campo"><span className="irs-rot">{modo === 'tirar' ? 'Senha de edição' : 'Senha atual'}</span><input className="inp" type="password" autoComplete="off" value={atual} maxLength={72} onChange={(e) => setAtual(e.target.value)} /></label>}
          {modo !== 'tirar' && (<>
            <label className="irs-campo"><span className="irs-rot">{modo === 'criar' ? 'Senha' : 'Nova senha'}</span><input className="inp" type="password" autoComplete="new-password" value={nova} maxLength={72} onChange={(e) => setNova(e.target.value)} /></label>
            <label className="irs-campo"><span className="irs-rot">Repita a senha</span><input className="inp" type="password" autoComplete="new-password" value={conf} maxLength={72} onChange={(e) => setConf(e.target.value)} /></label>
          </>)}
          <div className="irs-senha-acoes"><BotaoSec type="button" onClick={fechar} disabled={ocupado}>Cancelar</BotaoSec><BotaoPrimario type="submit" disabled={ocupado}>{ocupado ? 'Salvando…' : modo === 'tirar' ? 'Tirar a senha' : 'Salvar a senha'}</BotaoPrimario></div>
          {erro && <p className="irs-erro" role="alert">{erro}</p>}
        </form>
      )}
    </Bloco>
  );
}

/** no lugar da parte da tela, quando a versão tem senha e a edição ainda não foi aberta nesta aba */
export function PortaoSenha({ v }: { v: VersaoIris }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ir = async () => {
    if (!senha) { setErro('Digite a senha de edição.'); return; }
    setOcupado(true); setErro('');
    try { const r = await destravarEdicao(v.id, senha); if (r !== 'ok') setErro(MSG_SENHA[r]); }
    catch (x) { setErro((x as Error).message); }
    finally { setOcupado(false); setSenha(''); }
  };
  return (
    <div className="irs-portao" data-iris-portao>
      <span className="irs-cop-ic"><Ic nome="senha" tam={20} /></span>
      <b>"{v.nome}" tem senha de edição</b>
      <p>Para mudar esta IA, digite a senha. A edição fica aberta por {ABERTA_MIN} minutos nesta aba. Ela continua atendendo normalmente.</p>
      <form onSubmit={(e) => { e.preventDefault(); void ir(); }}>
        <input className="inp" type="password" autoComplete="off" placeholder="Senha de edição" aria-label="Senha de edição" value={senha} maxLength={72} onChange={(e) => { setSenha(e.target.value); setErro(''); }} />
        <BotaoPrimario type="submit" disabled={ocupado}>{ocupado ? 'Conferindo…' : 'Abrir a edição'}</BotaoPrimario>
      </form>
      {erro && <p className="irs-erro" role="alert">{erro}</p>}
    </div>
  );
}
