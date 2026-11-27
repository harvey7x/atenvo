import { useEffect, useState } from 'react';
import { fotoIlustrativa } from '../lib/fotoIlustrativa';
import { atualizarFoto, useFotoReal } from '../lib/fotosReais';
import './componentes.css';

/* Foto do cliente por cima das iniciais do avatar.
   24/11 (dono: "quero que apareça as fotos reais dos clientes"): no Atendimento é a FOTO REAL do WhatsApp
   (lib/fotosReais) — passe o id do CONTATO; quem esconde a foto (ou não tem) fica com as iniciais, nunca com
   um rosto inventado. `atualizar` (só na conversa aberta) pede ao servidor a foto de agora quando a guardada
   tem mais de 7 dias. `ilustrativa` mantém o retrato livre de antes (lib/fotoIlustrativa) nas telas que ainda
   não têm a foto real (conversas das Cobranças, outro WhatsApp e outro cadastro).
   O avatar pai precisa de position: relative; se a imagem não carregar, ela some e as iniciais aparecem. */
export function FotoCliente({ nome, id, tam, atualizar = false, ilustrativa = false }: {
  nome: string; id: string; tam: number; atualizar?: boolean; ilustrativa?: boolean;
}) {
  const real = useFotoReal(ilustrativa ? null : id, nome);
  const src = ilustrativa ? fotoIlustrativa(nome, id) : real;
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [src]);
  useEffect(() => { if (atualizar && !ilustrativa) atualizarFoto(id); }, [atualizar, ilustrativa, id]);
  if (!src || falhou) return null;
  return (
    <img
      className="foto-cli" src={src} alt="" width={tam} height={tam}
      loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
    />
  );
}
