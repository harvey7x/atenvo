import { fotoIlustrativa } from '../lib/fotoIlustrativa';
import './componentes.css';

/* Foto ILUSTRATIVA do cliente por cima das iniciais do avatar — Kanban (29/10), WhatsApp e
   Painel da Equipe (dono 30/10: "nos WhatsApps… essas fotos dos clientes demonstrativas").
   Não é o cliente: ver lib/fotoIlustrativa. Passe o id do CONTATO para o mesmo cliente ter a
   mesma foto em todas as telas. O avatar pai precisa de position: relative; se a imagem não
   carregar, ela some e as iniciais (que ficam por baixo) aparecem. */
export function FotoCliente({ nome, id, tam }: { nome: string; id: string; tam: number }) {
  return (
    <img
      className="foto-cli" src={fotoIlustrativa(nome, id)} alt="" width={tam} height={tam}
      loading="lazy" decoding="async" draggable={false}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
