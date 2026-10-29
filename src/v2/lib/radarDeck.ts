// GERADO de scratchpad/deck/textos_final.json (caderno do Radar da bancada de design, 29/10).
// O banco tem a cópia dos textos que ele grava (radar_textos); mude os dois juntos.
import type { RadarTexto } from './radarTextos';

export const DECK: Record<string, RadarTexto> = {
  "alerta.negociacao.1": {
    "titulo": "Em negociação · 1º aviso",
    "texto": "Sem resposta há {tempo}. Responda ao cliente para encerrar os avisos."
  },
  "alerta.negociacao.2": {
    "titulo": "Em negociação · 2º aviso",
    "texto": "Sem resposta há {tempo}. O próximo é o último aviso."
  },
  "alerta.negociacao.3": {
    "titulo": "Em negociação · último aviso",
    "texto": "Sem resposta há {tempo}. Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você."
  },
  "alerta.fechado.1": {
    "titulo": "Cliente fechado · 1º aviso",
    "texto": "Sem resposta há {tempo}. Responda ao cliente para encerrar os avisos."
  },
  "alerta.fechado.2": {
    "titulo": "Cliente fechado · 2º aviso",
    "texto": "Sem resposta há {tempo}. O próximo é o último aviso."
  },
  "alerta.fechado.3": {
    "titulo": "Cliente fechado · último aviso",
    "texto": "Sem resposta há {tempo}. Já assinou com o escritório e aguarda seu retorno."
  },
  "alerta.ligar": {
    "titulo": "Ligar para o cliente",
    "texto": "Parou no atendimento automático há {tempo} e ainda não falou com a equipe. Ligue para retomar a conversa."
  },
  "alerta.cutucada": {
    "titulo": "Pedido do gestor",
    "texto": "{gestor} pediu que você responda agora. Sem resposta há {tempo}."
  },
  "extra.alerta.linha_prioridade": {
    "texto": "Lead prioritário: {prioridade}. Os avisos chegam mais cedo."
  },
  "notif.negociacao.1": {
    "titulo": "{cliente} · 1º aviso",
    "texto": "Cliente em negociação sem resposta desde {desde}. Responda para encerrar os avisos."
  },
  "notif.negociacao.2": {
    "titulo": "{cliente} · 2º aviso",
    "texto": "Cliente em negociação sem resposta desde {desde}. O próximo é o último aviso."
  },
  "notif.negociacao.3": {
    "titulo": "{cliente} · último aviso",
    "texto": "Cliente em negociação sem resposta desde {desde}. Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você."
  },
  "notif.fechado.1": {
    "titulo": "{cliente} · 1º aviso",
    "texto": "Cliente fechado sem resposta desde {desde}. Responda para encerrar os avisos."
  },
  "notif.fechado.2": {
    "titulo": "{cliente} · 2º aviso",
    "texto": "Cliente fechado sem resposta desde {desde}. O próximo é o último aviso."
  },
  "notif.fechado.3": {
    "titulo": "{cliente} · último aviso",
    "texto": "Cliente fechado sem resposta desde {desde}. Já assinou com o escritório e aguarda seu retorno."
  },
  "notif.ligar": {
    "titulo": "Ligue para {cliente}",
    "texto": "Lead novo parou no atendimento automático em {desde} e ainda não falou com a equipe. Ligue para retomar a conversa."
  },
  "notif.ligar_sem_dono": {
    "titulo": "{cliente} · sem responsável",
    "texto": "Lead novo parou no atendimento automático em {desde} e não tem responsável. Defina quem vai ligar."
  },
  "notif.decisao": {
    "titulo": "{cliente} · decisão de repasse",
    "texto": "Com {atendente}, sem resposta desde {desde}. Escolha entre manter e repassar; nada muda sem a sua decisão."
  },
  "notif.cutucada": {
    "titulo": "{cliente} · pedido do gestor",
    "texto": "{gestor} pediu que você responda agora. Cliente sem resposta desde {desde}."
  },
  "notif.repasse_saiu": {
    "titulo": "{cliente} passou para {para}",
    "texto": "Decisão de {gestor} após 1 dia útil sem resposta. Nenhuma ação sua é necessária."
  },
  "notif.repasse_recebeu": {
    "titulo": "{cliente} passou para você",
    "texto": "Decisão de {gestor}. Estava com {de}, sem resposta desde {desde}. Responda com prioridade; o ciclo de avisos recomeça com você."
  },
  "notif.mantido": {
    "titulo": "{cliente} continua com você",
    "texto": "{gestor} manteve o atendimento com você após 1 dia útil sem resposta. Responda com prioridade; o ciclo de avisos recomeça agora."
  },
  "notif.resumo.negociacao": {
    "titulo": "{n} clientes em negociação sem resposta",
    "texto": "Vários avisos chegaram juntos e foram agrupados. Clique para ver a lista em ordem de urgência."
  },
  "notif.resumo.fechado": {
    "titulo": "{n} clientes fechados sem resposta",
    "texto": "Vários avisos chegaram juntos e foram agrupados. Clique para ver a lista em ordem de urgência."
  },
  "notif.resumo.ligar": {
    "titulo": "{n} leads novos para ligar",
    "texto": "Pararam no atendimento automático e ainda não falaram com a equipe. Clique para ver a lista."
  },
  "nota.repasse": {
    "texto": "Radar de Atendimento: {gestor} repassou o cliente de {de} para {para} após 1 dia útil sem resposta."
  },
  "nota.mantido": {
    "texto": "Radar de Atendimento: {gestor} manteve o cliente com {atendente} após 1 dia útil sem resposta."
  },
  "nota.cutucada": {
    "texto": "Radar de Atendimento: {gestor} pediu a {atendente} resposta imediata. Cliente sem resposta desde {desde}."
  },
  "nota.ligou": {
    "texto": "Radar de Atendimento: {atendente} registrou ligação para o cliente, que tinha parado no atendimento automático."
  },
  "atividade.repasse": {
    "texto": "Radar de Atendimento: {gestor} repassou o cliente de {de} para {para} após 1 dia útil sem resposta."
  },
  "barra.negociacao": {
    "titulo": "Em negociação",
    "texto": "Clientes em negociação sem resposta, a partir do 1º aviso. Clique para ver a lista."
  },
  "barra.fechados": {
    "titulo": "Fechados",
    "texto": "Clientes fechados sem resposta, a partir do 1º aviso. Clique para ver a lista."
  },
  "barra.ligar": {
    "titulo": "Ligar",
    "texto": "Leads novos parados no atendimento automático, sem contato da equipe. Clique para ver a lista."
  },
  "barra.decisoes": {
    "titulo": "Decisões",
    "texto": "Clientes em negociação com 1 dia útil sem resposta, aguardando sua decisão. Clique para ver a lista."
  },
  "barra.dica": {
    "titulo": "Radar de Atendimento",
    "texto": "Clientes que aguardam você, com negociação e fechados separados. Avisos de segunda a sexta, das 9h às 18h."
  },
  "extra.barra.sub_ultimo": {
    "texto": "No último aviso: {n}"
  },
  "extra.barra.pedido": {
    "titulo": "Pedido do gestor",
    "texto": "O gestor pediu resposta imediata a um cliente seu. Clique para ver."
  },
  "extra.barra.mais": {
    "titulo": "Mais",
    "texto": "Outras filas do Radar. Clique para abrir a lista."
  },
  "central.titulo": {
    "titulo": "Aguardando você"
  },
  "central.subtitulo": {
    "texto": "Em ordem de urgência, com tempos em horário útil."
  },
  "central.aba.negociacao": {
    "titulo": "Em negociação"
  },
  "central.aba.fechados": {
    "titulo": "Fechados"
  },
  "central.aba.ligar": {
    "titulo": "Ligar"
  },
  "central.aba.decisoes": {
    "titulo": "Decisões"
  },
  "central.grupo.ultimo": {
    "titulo": "Último aviso"
  },
  "central.grupo.segundo": {
    "titulo": "2º aviso"
  },
  "central.grupo.primeiro": {
    "titulo": "1º aviso"
  },
  "extra.central.grupo_pedido": {
    "titulo": "Pedido do gestor"
  },
  "central.linha.negociacao": {
    "titulo": "{cliente}",
    "texto": "Sem resposta há {tempo}"
  },
  "central.linha.fechado": {
    "titulo": "{cliente}",
    "texto": "Sem resposta há {tempo}"
  },
  "central.linha.ligar": {
    "titulo": "{cliente}",
    "texto": "Parou no atendimento automático há {tempo}"
  },
  "central.linha.decisao": {
    "titulo": "{cliente}",
    "texto": "Com {atendente} · sem resposta há {tempo}"
  },
  "extra.central.linha_desde": {
    "texto": "Sem resposta desde {desde}"
  },
  "extra.central.linha_pedido": {
    "texto": "Pedido de {gestor} · {tempo} sem resposta"
  },
  "central.vazio.negociacao": {
    "titulo": "Negociação em dia",
    "texto": "Nenhum cliente em negociação aguarda sua resposta."
  },
  "central.vazio.fechados": {
    "titulo": "Fechados em dia",
    "texto": "Nenhum cliente fechado aguarda sua resposta."
  },
  "central.vazio.ligar": {
    "titulo": "Ligações em dia",
    "texto": "Nenhum lead novo parado no atendimento automático."
  },
  "central.vazio.decisoes": {
    "titulo": "Decisões em dia",
    "texto": "Nenhuma decisão de repasse pendente."
  },
  "central.botao.responder": {
    "botao_primario": "Responder"
  },
  "central.botao.ja_liguei": {
    "botao_primario": "Já liguei",
    "botao_secundario": "Abrir conversa"
  },
  "central.botao.decidir": {
    "botao_primario": "Decidir"
  },
  "central.rodape": {
    "rodape": "O aviso se encerra com a resposta da equipe ao cliente. Nota interna e mensagem automática não contam."
  },
  "extra.central.mostrar_mais": {
    "texto": "Mostrar mais {n}"
  },
  "extra.central.mostrar_grupo": {
    "texto": "Mostrar {n}"
  },
  "extra.central.link_fechados": {
    "titulo": "Abrir a aba Fechados"
  },
  "extra.central.link_painel": {
    "titulo": "Abrir painel do Radar"
  },
  "extra.central.ok_ligacao": {
    "texto": "Ligação registrada na conversa."
  },
  "tela.negociacao_ultimo": {
    "sobrelinha": "Em negociação · último aviso",
    "titulo": "Este cliente aguarda sua resposta",
    "texto": "Aguardando no WhatsApp",
    "fatos": [
      "Sem resposta",
      "Desde",
      "Gestor decide"
    ],
    "botao_primario": "Abrir conversa e responder",
    "botao_secundario": "Lembrar em 15 min",
    "rodape": "O gestor decide se o cliente continua com você."
  },
  "tela.fechado_ultimo": {
    "sobrelinha": "Cliente fechado · último aviso",
    "titulo": "Este cliente aguarda seu retorno",
    "texto": "Aguardando no WhatsApp",
    "fatos": [
      "Sem resposta",
      "Desde",
      "Aviso"
    ],
    "botao_primario": "Abrir conversa e responder",
    "botao_secundario": "Lembrar em 15 min",
    "rodape": "Clientes fechados não vão para repasse: o acompanhamento é seu."
  },
  "tela.cutucada": {
    "sobrelinha": "Pedido do gestor",
    "titulo": "Responda a este cliente agora",
    "texto": "Aguardando no WhatsApp",
    "fatos": [
      "Sem resposta",
      "Pedido por",
      "Pedido há"
    ],
    "botao_primario": "Abrir conversa e responder",
    "botao_secundario": "Responder em seguida",
    "rodape": "O pedido se encerra quando você responder ao cliente."
  },
  "extra.tela.mais_ultimo": {
    "texto": "Também no último aviso: {n}"
  },
  "extra.tela.mais_pedidos": {
    "texto": "Outros pedidos do gestor: {n}"
  },
  "extra.tela.ver_lista": {
    "titulo": "Ver lista"
  },
  "extra.tela.decisao_em": {
    "texto": "Em {tempo}"
  },
  "extra.tela.decisao_acionada": {
    "texto": "Já acionado"
  },
  "extra.tela.decisao_regra": {
    "texto": "Com 1 dia útil"
  },
  "extra.tela.decisao_dica": {
    "texto": "Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você."
  },
  "extra.tela.aviso_valor": {
    "texto": "3 de 3"
  },
  "extra.etiqueta.negociacao": {
    "titulo": "Em negociação"
  },
  "extra.etiqueta.fechado": {
    "titulo": "Cliente fechado"
  },
  "selo.negociacao.1": {
    "titulo": "1º aviso",
    "texto": "Em negociação, 1º de 3 avisos. Sem resposta há {tempo}."
  },
  "selo.negociacao.2": {
    "titulo": "2º aviso",
    "texto": "Em negociação, 2º de 3 avisos. Sem resposta há {tempo}."
  },
  "selo.negociacao.3": {
    "titulo": "Último aviso",
    "texto": "Em negociação, último aviso. Sem resposta há {tempo}."
  },
  "selo.fechado.1": {
    "titulo": "1º aviso",
    "texto": "Cliente fechado, 1º de 3 avisos. Sem resposta há {tempo}."
  },
  "selo.fechado.2": {
    "titulo": "2º aviso",
    "texto": "Cliente fechado, 2º de 3 avisos. Sem resposta há {tempo}."
  },
  "selo.fechado.3": {
    "titulo": "Último aviso",
    "texto": "Cliente fechado, último aviso. Sem resposta há {tempo}."
  },
  "selo.ligar": {
    "titulo": "Ligar",
    "texto": "Ligar para o cliente: parou no atendimento automático há {tempo}."
  },
  "selo.cutucada": {
    "titulo": "Gestor pediu",
    "texto": "Pedido do gestor: responder a este cliente agora."
  },
  "selo.prioridade.docs": {
    "titulo": "Documentação",
    "texto": "Lead prioritário: documentação enviada. Avisos mais cedo, em 15 min, 1 h e 3 h úteis."
  },
  "selo.prioridade.interesse": {
    "titulo": "Interesse",
    "texto": "Lead prioritário: interesse confirmado. Avisos mais cedo, em 15 min, 1 h e 3 h úteis."
  },
  "extra.selo.era_de": {
    "titulo": "Era de {de}",
    "texto": "Atendimento repassado de {de} para {para} por decisão do gestor."
  },
  "extra.inbox.cabecalho": {
    "texto": "sem resposta há {tempo}"
  },
  "extra.inbox.proximo": {
    "titulo": "Próximo aguardando: {cliente}",
    "texto": "Sem resposta há {tempo}"
  },
  "painel.hero.decisoes": {
    "titulo": "Aguardando sua decisão",
    "texto": "Mais antiga há {tempo}"
  },
  "painel.hero.negociacao": {
    "titulo": "Em negociação sem resposta",
    "texto": "No último aviso: {n}"
  },
  "painel.hero.fechados": {
    "titulo": "Fechados sem resposta",
    "texto": "No último aviso: {n}"
  },
  "painel.hero.ligar": {
    "titulo": "Leads para ligar",
    "texto": "Sem responsável: {n}"
  },
  "extra.painel.hero_zero": {
    "texto": "Em dia"
  },
  "extra.painel.regras": {
    "texto": "Avisos: 30 min, 2 h e 5 h úteis (prioritário: 15 min, 1 h e 3 h) · Gestor decide: 1 dia útil · Fechados sem repasse · Seg. a sex., 9h às 18h"
  },
  "painel.secao.decisoes": {
    "titulo": "Aguardando sua decisão",
    "texto": "Clientes em negociação com 1 dia útil sem resposta. Escolha entre manter e repassar; nada muda sem a sua decisão."
  },
  "extra.painel.secao_equipe": {
    "titulo": "Pendências por atendente",
    "texto": "Quem tem clientes aguardando agora. Clique em um nome para filtrar as listas abaixo."
  },
  "painel.secao.negociacao": {
    "titulo": "Em negociação sem resposta",
    "texto": "Fila ao vivo da equipe, do último aviso ao primeiro, com prioritários no topo de cada grupo."
  },
  "painel.secao.fechados": {
    "titulo": "Fechados sem resposta",
    "texto": "Clientes que já fecharam e aguardam retorno. Não entram em decisão de repasse; peça resposta ao atendente quando precisar."
  },
  "painel.secao.ligar": {
    "titulo": "Leads para ligar",
    "texto": "Leads novos parados no atendimento automático há 2 h úteis ou mais, ainda sem contato da equipe."
  },
  "extra.painel.secao_ranking": {
    "titulo": "Conversão por atendente",
    "texto": "Fechados sobre recebidos nos últimos 30 dias. É a base da sugestão de repasse."
  },
  "extra.painel.secao_historico": {
    "titulo": "Histórico de decisões",
    "texto": "Cada decisão do gestor e o desfecho do cliente, nos últimos 30 dias."
  },
  "extra.painel.hist_repasses": {
    "titulo": "Repasses: {n}"
  },
  "extra.painel.hist_mantidos": {
    "titulo": "Mantidos: {n}"
  },
  "extra.painel.hist_fechados": {
    "titulo": "Fechados após repasse: {n}"
  },
  "extra.painel.desfecho_mantido": {
    "titulo": "Mantido com {atendente}"
  },
  "extra.painel.desfecho_fechou": {
    "titulo": "{para} fechou"
  },
  "extra.painel.desfecho_perdido": {
    "titulo": "Perdido"
  },
  "extra.painel.desfecho_andamento": {
    "titulo": "Em andamento"
  },
  "extra.painel.grupo_atendente": {
    "titulo": "Com {atendente}"
  },
  "extra.painel.cartao_decisao": {
    "texto": "Com {atendente} · sem resposta há {tempo}",
    "botao_primario": "Repassar para {para}",
    "botao_secundario": "Manter com {atendente}"
  },
  "extra.painel.sugestao": {
    "titulo": "Sugerido · maior conversão"
  },
  "extra.painel.pedir_resposta": {
    "texto": "{atendente} recebe na hora um aviso em tela cheia para responder a este cliente.",
    "botao_primario": "Pedir resposta a {atendente}"
  },
  "extra.painel.ok_pedido": {
    "texto": "Pedido registrado para {atendente}."
  },
  "extra.painel.pedido_feito": {
    "titulo": "Pedido feito há {tempo}"
  },
  "extra.painel.lote": {
    "titulo": "Selecionados: {n}",
    "texto": "Cada cliente fica registrado no histórico como decisão sua.",
    "botao_primario": "Repassar para…",
    "botao_secundario": "Manter com o atendente atual"
  },
  "extra.painel.lote_confirma": {
    "titulo": "Confirmar repasse para {para}",
    "texto": "Clientes selecionados: {n}. Cada um passa para {para} e fica registrado no histórico como decisão sua.",
    "botao_primario": "Confirmar repasse",
    "botao_secundario": "Cancelar"
  },
  "extra.painel.filtro": {
    "titulo": "Filtrando: {atendente}"
  },
  "extra.painel.mostrar_todos": {
    "titulo": "Mostrar todos"
  },
  "extra.painel.sem_responsavel": {
    "titulo": "Sem responsável"
  },
  "extra.painel.vazio_decisoes": {
    "texto": "Nenhuma decisão pendente."
  },
  "extra.painel.vazio_negociacao": {
    "texto": "Nenhum cliente em negociação sem resposta agora."
  },
  "extra.painel.vazio_fechados": {
    "texto": "Nenhum cliente fechado sem resposta agora."
  },
  "extra.painel.vazio_ligar": {
    "texto": "Nenhum lead novo parado no atendimento automático."
  },
  "extra.erro.decisao_expirada": {
    "texto": "Esta decisão não está mais pendente. A lista foi atualizada."
  },
  "extra.erro.decisao_sem_permissao": {
    "texto": "Só o gestor pode decidir repasses."
  },
  "extra.erro.destino_inativo": {
    "texto": "O atendente escolhido não está ativo. Escolha outra pessoa."
  },
  "extra.erro.pedido_respondido": {
    "texto": "Este cliente já foi respondido. Não é preciso pedir resposta."
  },
  "extra.erro.pedido_sem_permissao": {
    "texto": "Só o gestor pode pedir resposta ao atendente."
  },
  "extra.erro.pedido_recente": {
    "texto": "Você pediu resposta há menos de 10 min. Aguarde antes de pedir de novo."
  },
  "extra.erro.pedido_sem_dono": {
    "texto": "Este cliente está sem atendente. Defina um responsável antes de pedir resposta."
  },
  "extra.erro.ligacao_sem_permissao": {
    "texto": "Só o responsável pelo cliente ou o gestor pode registrar a ligação."
  },
  "sino.categoria.negociacao": {
    "titulo": "Em negociação"
  },
  "sino.categoria.fechados": {
    "titulo": "Fechados"
  },
  "sino.categoria.ligar": {
    "titulo": "Ligar"
  },
  "sino.categoria.gestao": {
    "titulo": "Gestão"
  },
  "sino.categoria.outros": {
    "titulo": "Outros"
  },
  "sino.vazio": {
    "titulo": "Tudo em dia",
    "texto": "Nenhuma notificação nova. As já lidas ficam no filtro Todas."
  },
  "extra.sino.titulo": {
    "titulo": "Notificações"
  },
  "extra.sino.marcar_todas": {
    "titulo": "Marcar todas como lidas"
  },
  "extra.sino.filtro_naolidas": {
    "titulo": "Não lidas"
  },
  "extra.sino.filtro_todas": {
    "titulo": "Todas"
  },
  "extra.sino.ver_todas": {
    "titulo": "Ver todas"
  },
  "extra.sino.encerrado": {
    "titulo": "Encerrado"
  },
  "extra.sino.resumo_decisoes": {
    "titulo": "Decisões de repasse pendentes: {n}",
    "texto": "Clientes em negociação com 1 dia útil sem resposta. Clique para decidir no painel do Radar."
  },
  "extra.erro.ligacao_falhou": {
    "texto": "Não foi possível registrar a ligação. Tente de novo."
  },
  "extra.inbox.aba_fechados": {
    "texto": "Clientes fechados (pós-venda). O número conta todos os que aguardam resposta, inclusive os que ainda não chegaram ao 1º aviso do Radar."
  },
  "extra.sino.vazio_todas": {
    "titulo": "Tudo em dia"
  },
  "extra.painel.col_cliente": {
    "titulo": "Cliente"
  },
  "extra.painel.col_prioridade": {
    "titulo": "Prioridade"
  },
  "extra.painel.col_responsavel": {
    "titulo": "Responsável"
  },
  "extra.painel.col_decisao_em": {
    "titulo": "Decisão em"
  },
  "extra.painel.col_pedir": {
    "titulo": "Pedir resposta"
  },
  "extra.painel.col_quem_liga": {
    "titulo": "Quem deve ligar"
  },
  "extra.painel.col_parado": {
    "titulo": "Parado há"
  },
  "extra.painel.col_atendente": {
    "titulo": "Atendente"
  },
  "extra.painel.col_recebidos": {
    "titulo": "Recebidos"
  },
  "extra.painel.col_conversao": {
    "titulo": "Conversão"
  },
  "extra.painel.col_repassados": {
    "titulo": "Clientes repassados"
  },
  "extra.painel.col_quando": {
    "titulo": "Quando"
  },
  "extra.painel.col_desfecho": {
    "titulo": "Desfecho"
  },
  "extra.painel.decisao_pedida": {
    "texto": "Pedida"
  },
  "extra.painel.vazio_ranking": {
    "texto": "Nenhum dado de conversão nos últimos 30 dias."
  },
  "extra.painel.vazio_historico": {
    "texto": "Nenhuma decisão nos últimos 30 dias."
  },
  "extra.painel.erro_carga": {
    "texto": "Não foi possível carregar esta lista."
  },
  "extra.painel.tentar_de_novo": {
    "titulo": "Tentar de novo"
  }
};
