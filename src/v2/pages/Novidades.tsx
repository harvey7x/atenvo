/* Atendimento › O QUE MUDOU (25/11): as novidades do sistema, da mais nova para a mais antiga, cada uma com o lugar onde
   fica e o botão que leva até ela. Só aparece o que esta pessoa pode abrir. As que ela ainda não tinha visto ganham o
   selo "Novo" (e somem do número do menu ao abrir esta página). Dados: data/novidades.ts. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { BotaoSec, CardVidro } from '../components';
import { temRecurso } from '../data/config/recursos';
import { idsVistos, marcarVistas, novidadesPara } from '../data/novidades';
import './novidades.css';

export default function NovidadesPagina() {
  const ir = useNavigate();
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  const lista = useMemo(() => novidadesPara(admin, temRecurso), [admin]);
  // o "Novo" é de quando a página abriu; marcar como vistas na hora não apaga o selo desta visita
  const [vistasAntes] = useState(idsVistos);
  useEffect(() => { marcarVistas(lista.map((n) => n.id)); }, [lista]);
  const porDia = useMemo(() => {
    const g = new Map<string, typeof lista>();
    for (const n of lista) g.set(n.quando, [...(g.get(n.quando) ?? []), n]);
    return [...g.entries()];
  }, [lista]);
  const novas = lista.filter((n) => !vistasAntes.has(n.id)).length;

  return (
    <div className="nv-pg" data-novidades>
      <header className="nv-cab">
        <div>
          <h1>O que mudou</h1>
          <p>As novidades do sistema, da mais nova para a mais antiga. Toque em <b>Abrir</b> para ir direto ao lugar.</p>
        </div>
        {novas > 0 && <span className="nv-n num">{novas} {novas === 1 ? 'novidade nova' : 'novidades novas'}</span>}
      </header>
      {lista.length === 0 && <p className="nv-vazio">Nenhuma novidade por aqui ainda.</p>}
      {porDia.map(([dia, itens]) => (
        <section key={dia} className="nv-dia" aria-label={`Novidades de ${dia}`}>
          <h2>{dia}</h2>
          <div className="nv-lista">
            {itens.map((n) => (
              <CardVidro key={n.id} className="nv-item">
                <div className="nv-tx">
                  <div className="nv-tit">
                    <b>{n.titulo}</b>
                    {!vistasAntes.has(n.id) && <span className="nv-novo">Novo</span>}
                  </div>
                  <span className="nv-onde">{n.onde}</span>
                  <p>{n.texto}</p>
                </div>
                <BotaoSec onClick={() => ir(n.rota)}>Abrir</BotaoSec>
              </CardVidro>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
