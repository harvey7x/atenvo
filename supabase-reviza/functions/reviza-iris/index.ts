// reviza-iris — a IRIS atendendo no WhatsApp do Reviza (22/11).
// Quem chama é o banco (gatilho iris_ao_receber, a cada mensagem recebida num número com a Iris ligada), com
// um segredo no cabeçalho. Publicar com verify_jwt = false.
// O que ela faz: espera o cliente terminar de escrever, lê a conversa, responde com o Gemini usando a chave do
// cliente, passa a resposta pelas travas e envia. Ela PARA de responder naquela conversa quando uma pessoa da
// equipe responde, quando ela mesma passa o cliente para a equipe, ou quando algo dá errado (nunca improvisa).
// Nasce desligada e em modo teste (só responde aos números de teste) — ver migration 90.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { evolutionConfigured, sendPresence, sendText } from '../reviza-wa-enviar/evolution.ts';
import { chamarGemini, montarConversa, montarSistema, passarPelasTravas, type Agente, type Comportamentos, type Fala } from '../_shared/iris.ts';

const ESPERA_MS = 8_000;           // junta as mensagens que o cliente manda em sequência
const HISTORICO = 30;              // quantas mensagens da conversa ela lê
const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** mesmo número, com ou sem 55 e com ou sem o nono dígito: compara DDD + os 8 últimos */
const mesmoNumero = (a: string, b: string) => { const x = digitos(a).replace(/^55/, ''), y = digitos(b).replace(/^55/, ''); return x.length >= 10 && y.length >= 10 && x.slice(0, 2) === y.slice(0, 2) && x.slice(-8) === y.slice(-8); };
function igual(a: string, b: string): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: esperado } = await db.rpc('integracao_segredo_ler', { p_nome: 'iris_gatilho_segredo' });
  if (typeof esperado !== 'string' || !esperado || !igual(req.headers.get('x-iris-segredo') ?? '', esperado)) return new Response('nao autorizado', { status: 401 });

  const corpo = await req.json().catch(() => ({})) as { mensagem_id?: string };
  const { data: msg } = await db.from('wa_mensagens').select('id, conversa_id, canal_id, direcao, tipo, created_at').eq('id', String(corpo.mensagem_id ?? '')).maybeSingle();
  if (!msg || msg.direcao !== 'entrada') return ok({ ignorou: 'não é mensagem recebida' });

  const { data: cfg } = await db.from('iris_canais_config').select('*').eq('canal_id', msg.canal_id).maybeSingle();
  if (!cfg?.ia_enabled || !cfg.ia_agente_id) return ok({ ignorou: 'Iris desligada neste número' });
  const { data: agente } = await db.from('ia_agentes').select('id, nome, modelo, persona_prompt, conhecimento, comportamentos, ativo').eq('id', cfg.ia_agente_id).maybeSingle();
  if (!agente?.ativo) return ok({ ignorou: 'atendente desligada' });
  const [{ data: conv }, { data: canal }] = await Promise.all([
    db.from('wa_conversas').select('id, telefone, nome_contato').eq('id', msg.conversa_id).maybeSingle(),
    db.from('wa_canais').select('id, instancia, dono_id, nome').eq('id', msg.canal_id).maybeSingle(),
  ]);
  if (!conv || !canal) return ok({ ignorou: 'conversa ou número não encontrado' });
  // modo teste: só responde aos números de teste
  if (cfg.ia_modo_teste && !(cfg.numeros_teste ?? []).some((n: string) => mesmoNumero(n, conv.telefone))) return ok({ ignorou: 'modo teste: número fora da lista' });

  const comp = (agente.comportamentos ?? {}) as Comportamentos;
  const base = { canal_id: canal.id, conversa_id: conv.id, agente_id: agente.id };
  const registrar = (tipo: string, detalhe: string | null, extra: Record<string, unknown> = {}) => db.from('iris_log').insert({ ...base, tipo, detalhe, ...extra });
  /** a Iris sai da conversa e a equipe é avisada (no sino de quem é dono do número; sem dono, dos administradores) */
  const passarParaEquipe = async (motivo: string) => {
    await db.from('iris_sessoes').upsert({ conversa_id: conv.id, estado: 'humano', motivo, atualizada_em: new Date().toISOString() });
    await registrar('passou_humano', motivo);
    const quem = conv.nome_contato || digitos(conv.telefone);
    let destinos: string[] = canal.dono_id ? [canal.dono_id] : [];
    if (!destinos.length) { const { data: adms } = await db.from('profiles').select('id').eq('papel', 'admin').eq('ativo', true); destinos = (adms ?? []).map((a) => a.id); }
    for (const u of destinos) await db.rpc('notificar', { p_user: u, p_tipo: 'iris_passou', p_titulo: `A Iris passou ${quem} para você`, p_corpo: motivo, p_rota: '/cobrancas/conversas' });
  };

  try {
    // 1) espera o cliente terminar: se chegou outra mensagem dele depois desta, quem responde é a chamada dela
    await dorme(ESPERA_MS);
    const { data: ultima } = await db.from('wa_mensagens').select('id').eq('conversa_id', conv.id).eq('direcao', 'entrada').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ultima?.id !== msg.id) return ok({ ignorou: 'chegou mensagem mais nova' });

    // 2) a conversa é da Iris ou de uma pessoa?
    const { data: sessaoAtual } = await db.from('iris_sessoes').select('*').eq('conversa_id', conv.id).maybeSingle();
    let sessao = sessaoAtual;
    if (!sessao) { const { data: nova } = await db.from('iris_sessoes').insert({ conversa_id: conv.id }).select('*').single(); sessao = nova; }
    if (!sessao || sessao.estado === 'humano') return ok({ ignorou: 'conversa com a equipe' });

    const { data: mensagens } = await db.from('wa_mensagens').select('id, direcao, tipo, conteudo, envio_id, created_at, apagada')
      .eq('conversa_id', conv.id).order('created_at', { ascending: false }).limit(HISTORICO);
    const linha = (mensagens ?? []).filter((m) => !m.apagada).reverse();
    const idsSaida = linha.filter((m) => m.direcao === 'saida').map((m) => m.id);
    const { data: dela } = idsSaida.length ? await db.from('iris_log').select('mensagem_id').in('mensagem_id', idsSaida) : { data: [] };
    const daIris = new Set((dela ?? []).map((l) => l.mensagem_id));
    // uma pessoa respondeu nesta conversa depois que a Iris começou → a conversa é dela; a Iris sai sem falar nada
    const pessoaRespondeu = linha.some((m) => m.direcao === 'saida' && !m.envio_id && !daIris.has(m.id) && m.created_at >= sessao.iniciada_em);
    if (pessoaRespondeu) {
      await db.from('iris_sessoes').update({ estado: 'humano', motivo: 'uma pessoa da equipe respondeu', atualizada_em: new Date().toISOString() }).eq('conversa_id', conv.id);
      return ok({ ignorou: 'uma pessoa da equipe assumiu' });
    }

    // 3) teto do dia neste número
    const teto = Math.max(1, Number(comp.max_chamadas_dia) || 500);
    const inicioDoDia = new Date(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) + 'T03:00:00Z').toISOString();
    const { count: hoje } = await db.from('iris_log').select('id', { count: 'exact', head: true }).eq('canal_id', canal.id).in('tipo', ['respondeu', 'bloqueada']).gte('quando', inicioDoDia);
    if ((hoje ?? 0) >= teto) { await passarParaEquipe('a Iris atingiu o teto de respostas do dia neste número'); return ok({ passou: 'teto do dia' }); }

    // 4) a chave do cliente e a resposta
    const { data: chave } = await db.rpc('integracao_segredo_ler', { p_nome: `iris_chave_${agente.id}` });
    if (typeof chave !== 'string' || !chave) { await passarParaEquipe('a chave do Google não está guardada'); return ok({ passou: 'sem chave' }); }
    if (!evolutionConfigured()) { await registrar('erro', 'servidor do WhatsApp não configurado'); return ok({ erro: 'whatsapp não configurado' }); }
    const falas: Fala[] = linha.map((m) => ({
      de: m.direcao === 'entrada' ? 'cliente' : daIris.has(m.id) ? 'ia' : 'humano',
      texto: m.tipo === 'texto' ? String(m.conteudo ?? '') : `[o cliente enviou ${m.tipo === 'audio' ? 'um áudio' : m.tipo === 'imagem' ? 'uma imagem' : m.tipo === 'documento' ? 'um documento' : 'um arquivo'}]`,
    }));
    const r = await chamarGemini(chave, agente.modelo, montarSistema(agente as Agente), montarConversa(falas));

    // 5) as travas
    const bolhas = passarPelasTravas(r.mensagens, comp);
    const enviar = bolhas.filter((b) => !b.bloqueada);
    if (bolhas.some((b) => b.bloqueada)) await registrar('bloqueada', 'uma resposta foi barrada pelas travas (tema proibido ou vazia)');
    if (!enviar.length) { await passarParaEquipe('a resposta da Iris foi barrada pelas travas'); return ok({ passou: 'resposta barrada' }); }

    // 6) envia — mas antes confere de novo: se o cliente ou a equipe escreveram enquanto ela pensava, não manda resposta velha
    const { data: maisNova } = await db.from('wa_mensagens').select('id, direcao').eq('conversa_id', conv.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (maisNova?.id !== msg.id) return ok({ ignorou: 'a conversa andou enquanto a Iris pensava' });
    let primeira = true;
    for (const b of enviar) {
      if (comp.simular_digitacao !== false) { const ms = Math.min(4500, 700 + b.texto.length * 30); try { await sendPresence(canal.instancia, conv.telefone, 'composing', ms); } catch { /* segue */ } await dorme(ms); }
      const env = await sendText(canal.instancia, conv.telefone, b.texto);
      const { data: gravada } = await db.from('wa_mensagens').insert({ conversa_id: conv.id, canal_id: canal.id, direcao: 'saida', tipo: 'texto', conteudo: b.texto, wa_id: env.id, status: 'enviada', autor_id: null }).select('id').single();
      await registrar('respondeu', null, { mensagem_id: gravada?.id ?? null, ...(primeira ? { tokens_entrada: r.tokensEntrada, tokens_saida: r.tokensSaida } : {}) });
      primeira = false;
    }
    await db.from('iris_sessoes').update({ atualizada_em: new Date().toISOString() }).eq('conversa_id', conv.id);
    if (r.humano) await passarParaEquipe(r.motivo || 'a Iris passou o cliente para a equipe');
    return ok({ respondeu: enviar.length, passou: r.humano });
  } catch (e) {
    // qualquer falha: ela não fala com o cliente e a equipe assume
    const detalhe = String((e as Error)?.message ?? e).slice(0, 300);
    try { await registrar('erro', detalhe); await passarParaEquipe(`falha técnica da Iris: ${detalhe.slice(0, 120)}`); } catch { /* nada a fazer */ }
    return ok({ erro: detalhe });
  }
});
