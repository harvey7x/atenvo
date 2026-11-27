/* CARREGANDO A TELA (27/11, dono: "quero que todas as telas tenham isso de carregamento"). O MESMO cartão do Dashboard
   ("Carregando o Dashboard": quatro barras, texto e barra de espera) para o sistema inteiro, montado UMA vez na casca:
   aparece sozinho enquanto a tela atual ainda espera a primeira resposta do banco (react-query: há consulta em voo e
   nenhum dado em cache para ela) e some quando a primeira chega. Telas que já têm o seu cartão (Dashboard, Kanban,
   WhatsApp) marcam [data-carregando-proprio] e este não aparece por cima. Só na primeira carga: atualização de fundo não
   mostra nada (seria um pisca a cada 8 s). */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import './carregandoTela.css';

const TITULO: [RegExp, string, string][] = [
  [/^\/whatsapp/, 'Carregando as conversas', 'Buscando as conversas e as últimas mensagens.'],
  [/^\/kanban/, 'Carregando o Kanban', 'Montando as colunas e os cards do funil.'],
  [/^\/contatos/, 'Carregando os contatos', 'Buscando a lista de clientes.'],
  [/^\/dashboard/, 'Carregando o Dashboard', 'Calculando as entradas, os fechados e o desempenho da equipe.'],
  [/^\/agenda/, 'Carregando a Agenda', 'Buscando as reuniões e os presenciais.'],
  [/^\/tarefas/, 'Carregando as tarefas', 'Buscando as tarefas da equipe.'],
  [/^\/scripts/, 'Carregando os scripts', 'Buscando as mensagens rápidas.'],
  [/^\/chat-equipe/, 'Carregando o chat', 'Buscando as conversas da equipe.'],
  [/^\/agendamentos/, 'Carregando os agendamentos', 'Buscando a fila de mensagens.'],
  [/^\/automacoes/, 'Carregando as automações', 'Buscando as sequências, as regras e os formulários.'],
  [/^\/cobrancas\/painel/, 'Carregando o Painel', 'Calculando a carteira, o recebido e a previsão.'],
  [/^\/cobrancas\/planilha/, 'Carregando a gestão', 'Buscando os clientes e os ciclos.'],
  [/^\/cobrancas/, 'Carregando as cobranças', 'Buscando os dados da carteira.'],
  [/^\/config/, 'Carregando as configurações', 'Buscando o que está ligado e como.'],
  [/^\/ferramentas/, 'Carregando a ferramenta', 'Preparando a tela.'],
  [/^\/pos-venda/, 'Carregando o pós-venda', 'Buscando os clientes fechados.'],
  [/^\/presenciais/, 'Carregando os presenciais', 'Buscando o calendário.'],
];
const PADRAO: [string, string] = ['Carregando', ''];

export function CarregandoTela() {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  // consultas em voo SEM dado em cache = primeira carga de alguma coisa desta tela
  const primeiras = useIsFetching({ predicate: (q) => q.state.status === 'pending' && q.state.data === undefined });
  const [mostra, setMostra] = useState(false);
  useEffect(() => {
    if (primeiras === 0) { setMostra(false); return; }
    // só aparece se demorar mais de 220 ms (resposta rápida não merece cartão) e se a tela não tem o seu próprio
    const t = window.setTimeout(() => {
      if (document.querySelector('[data-carregando-proprio]')) return;
      if (qc.isFetching({ predicate: (q) => q.state.status === 'pending' && q.state.data === undefined }) > 0) setMostra(true);
    }, 220);
    return () => window.clearTimeout(t);
  }, [primeiras, qc, pathname]);
  // para conferir o cartão com calma (prévia/varredura): localStorage 'reviza-forcar-carregando' = '1'
  let forcar = false; try { forcar = localStorage.getItem('reviza-forcar-carregando') === '1'; } catch { /* sem storage */ }
  if (!mostra && !forcar) return null;
  const [t, d] = TITULO.find(([re]) => re.test(pathname))?.slice(1) as [string, string] | undefined ?? PADRAO;
  return (
    <div className="ct-carr" role="status" aria-live="polite">
      <div className="ct-carr-caixa">
        <span className="ct-carr-ic" aria-hidden><i /><i /><i /><i /></span>
        <strong>{t}</strong>
        <span className="ct-carr-txt">{d ? d + ' ' : ''}Só um instante.</span>
        <span className="ct-carr-barra"><i /></span>
      </div>
    </div>
  );
}
