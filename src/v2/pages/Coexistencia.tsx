import { useCallback, useEffect, useRef, useState } from 'react';
import { CardVidro, CardCab, BotaoPrimario, BotaoMini, BadgeStatus } from '../components';
import './coexistencia.css';

/* Coexistência (WhatsApp Business App + Cloud API) — Embedded Signup da Meta.
   Rota escondida (sem link no menu), admin-only, decisão de 2026-07-30.

   O QUE ESTA PÁGINA FAZ: abre o popup oficial da Meta (Facebook Login for
   Business com a config de Cadastro incorporado do WhatsApp) e ESCUTA o
   postMessage da sessão. Nenhuma chamada ao nosso backend acontece aqui.

   O QUE ELA NÃO FAZ: não cria canal, não troca code por token, não toca no
   número de atendimento (1390). O vínculo do canal continua sendo o
   "Cadastrar número oficial" de Integrações, com os IDs copiados daqui.

   SONDA DE ELEGIBILIDADE: o veredito da Meta sobre o número sai na etapa do
   telefone, ANTES do pareamento no celular — dá para abrir o fluxo, ler o
   resultado e cancelar sem efeito colateral nenhum. */

// IDs PÚBLICOS do app Meta (client-side por natureza; o secret segue só no servidor).
const META_APP_ID = '2780700348970347';
const META_LOGIN_CONFIG_ID = '2051449595547363';
const SDK_VERSION = 'v25.0';

// O fluxo de coexistência exige o featureType de onboarding do app. A doc v4 cita o
// parâmetro em snake_case e a v3 em camelCase; chaves desconhecidas são ignoradas
// pela Meta, então mandamos as duas grafias até o formato assentar.
const EXTRAS_COEX = {
  setup: {},
  featureType: 'whatsapp_business_app_onboarding',
  feature_type: 'whatsapp_business_app_onboarding',
  sessionInfoVersion: '3',
};

type SessaoES = {
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    business_id?: string;
    current_step?: string;
    error_message?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

declare global {
  interface Window {
    FB?: {
      init: (cfg: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        cb: (resp: { authResponse?: { code?: string } | null; status?: string }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function origemFacebook(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
}

export default function CoexistenciaV2() {
  const [sdk, setSdk] = useState<'carregando' | 'pronto' | 'falhou'>('carregando');
  const [sessao, setSessao] = useState<SessaoES | null>(null);
  const [eventos, setEventos] = useState<string[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [codeEm, setCodeEm] = useState<number | null>(null);
  const [loginStatus, setLoginStatus] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const timerCopiado = useRef<ReturnType<typeof setTimeout>>();

  // Listener do session info: a Meta posta mensagens (string JSON) durante o fluxo.
  useEffect(() => {
    function aoReceber(ev: MessageEvent) {
      if (!origemFacebook(ev.origin)) return;
      let dado: unknown = ev.data;
      if (typeof dado === 'string') {
        try { dado = JSON.parse(dado); } catch { return; }
      }
      const msg = dado as SessaoES & { type?: string };
      if (msg?.type !== 'WA_EMBEDDED_SIGNUP') return;
      // eslint-disable-next-line no-console
      console.log('[coex] WA_EMBEDDED_SIGNUP:', msg);
      setSessao(msg);
      setEventos((xs) => [...xs, JSON.stringify(msg, null, 2)]);
    }
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, []);

  // SDK JS da Meta, carregado uma vez. fbAsyncInit ANTES do script entrar.
  useEffect(() => {
    if (window.FB) { setSdk('pronto'); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: false, xfbml: false, version: SDK_VERSION });
      setSdk('pronto');
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => setSdk('falhou');
    document.body.appendChild(s);
  }, []);

  const abrirFluxo = useCallback(() => {
    if (!window.FB) return;
    setLoginStatus(null);
    setCode(null);
    setCodeEm(null);
    window.FB.login(
      (resp) => {
        // eslint-disable-next-line no-console
        console.log('[coex] FB.login retorno:', resp);
        const c = resp?.authResponse?.code ?? null;
        if (c) { setCode(c); setCodeEm(Date.now()); }
        setLoginStatus(c ? 'code recebido' : (resp?.status ?? 'sem authResponse (fluxo cancelado ou incompleto)'));
      },
      {
        config_id: META_LOGIN_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: EXTRAS_COEX,
      },
    );
  }, []);

  const copiar = useCallback((rotulo: string, valor: string) => {
    void navigator.clipboard?.writeText(valor).then(() => {
      setCopiado(rotulo);
      clearTimeout(timerCopiado.current);
      timerCopiado.current = setTimeout(() => setCopiado(null), 1600);
    });
  }, []);

  const ids = sessao?.data ?? {};
  const concluiu = sessao?.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
  const cancelou = sessao?.event === 'CANCEL';

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Coexistência — número novo</h2>
          <p>
            Fluxo oficial da Meta para conectar um número que continua vivo no app WhatsApp Business.
            O número de atendimento atual não é tocado por esta página.
          </p>
        </div>
      </div>

      <div className="coex-grid">
        <CardVidro sobe atraso={0.06} className="coex-card">
          <CardCab titulo="1 · Abrir o fluxo da Meta" direita={
            sdk === 'pronto'
              ? <BadgeStatus tom="ok">SDK pronto</BadgeStatus>
              : sdk === 'falhou'
                ? <BadgeStatus tom="erro">SDK não carregou</BadgeStatus>
                : <BadgeStatus tom="atencao">Carregando SDK…</BadgeStatus>
          } />
          <p className="coex-texto">
            O popup pede login no Facebook (conta com papel no app), depois oferece
            <strong> conectar a conta existente do app WhatsApp Business</strong>. O veredito de
            elegibilidade do número aparece na etapa do telefone — dá para parar ali sem
            parear nada. Só funciona no domínio autorizado (produção), não em localhost.
          </p>
          <div className="coex-acoes">
            <BotaoPrimario onClick={abrirFluxo} disabled={sdk !== 'pronto'}>
              Abrir fluxo da Meta
            </BotaoPrimario>
            {loginStatus && <span className="coex-status">{loginStatus}</span>}
          </div>
        </CardVidro>

        <CardVidro sobe atraso={0.12} className="coex-card">
          <CardCab titulo="2 · Resultado da sessão" direita={
            sessao
              ? concluiu
                ? <BadgeStatus tom="ok">Pareamento concluído</BadgeStatus>
                : cancelou
                  ? <BadgeStatus tom="atencao">Cancelado em {String(ids.current_step ?? '?')}</BadgeStatus>
                  : <BadgeStatus tom="atencao">{String(sessao.event ?? 'evento')}</BadgeStatus>
              : <BadgeStatus tom="neutro">Aguardando fluxo</BadgeStatus>
          } />
          {!sessao && (
            <p className="coex-texto">
              Os identificadores aparecem aqui quando a Meta emitir o resultado da sessão
              (concluída ou cancelada).
            </p>
          )}
          {sessao && (
            <div className="coex-ids">
              {(['waba_id', 'phone_number_id', 'business_id'] as const).map((k) =>
                ids[k] ? (
                  <div className="coex-id" key={k}>
                    <span className="coex-id-rotulo">{k}</span>
                    <code className="coex-id-valor">{String(ids[k])}</code>
                    <BotaoMini onClick={() => copiar(k, String(ids[k]))}>
                      {copiado === k ? 'Copiado ✓' : 'Copiar'}
                    </BotaoMini>
                  </div>
                ) : null,
              )}
              {ids.error_message ? <p className="coex-erro">{String(ids.error_message)}</p> : null}
              {concluiu && (
                <p className="coex-texto">
                  Próximo passo (fora desta página): cadastrar o canal em Integrações →
                  API oficial → “Cadastrar número oficial”, colando os IDs acima.
                </p>
              )}
            </div>
          )}
          {code && (
            <p className="coex-code">
              <span className="coex-id-rotulo">code (expira em ~30s{codeEm ? `, recebido às ${new Date(codeEm).toLocaleTimeString()}` : ''})</span>
              <code className="coex-id-valor coex-quebra">{code}</code>
            </p>
          )}
        </CardVidro>

        {eventos.length > 0 && (
          <CardVidro sobe atraso={0.18} className="coex-card coex-largo">
            <CardCab titulo="Eventos brutos da sessão" contador={eventos.length} />
            <pre className="coex-log">{eventos.join('\n\n')}</pre>
          </CardVidro>
        )}
      </div>
    </>
  );
}
