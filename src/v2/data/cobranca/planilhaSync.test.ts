import { describe, expect, it } from 'vitest';
import {
  estadoIndisponivel, etapaPlanilhaConcluida, extrairIdPlanilha, haQuanto, passosConcluidos, saudeSync, syncVisivel,
  validarChaveLocal, type EstadoSync,
} from './planilhaSync';

/* Sincronização Google Planilhas — regras PURAS das telas (Etapa 1 do
   assistente + painel da Gestão). Sem prévia nem backend aqui. */

const ID = '1qZ8xVf3KpR2mT6yWb9nL4cD7hJ0sA5eUoGi-XyBvNw';

describe('link da planilha', () => {
  it('aceita o link de edição e devolve o ID', () => {
    const r = extrairIdPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`);
    expect(r).toEqual({ ok: true, id: ID, url: `https://docs.google.com/spreadsheets/d/${ID}/edit` });
  });
  it('aceita o formato com /u/0/, sem https e o ID solto', () => {
    expect(extrairIdPlanilha(`docs.google.com/spreadsheets/u/0/d/${ID}/edit?usp=sharing`).ok).toBe(true);
    expect(extrairIdPlanilha(`  ${ID}  `).ok).toBe(true);
  });
  it('recusa link do Excel Online, do Drive, de documento e .xlsx em modo de compatibilidade', () => {
    const casos = [
      'https://onedrive.live.com/edit.aspx?resid=ABC',
      'https://empresa-my.sharepoint.com/:x:/g/personal/planilha.xlsx',
      'https://drive.google.com/file/d/1abcdefghijklmnopqrstuvwxyz12345/view',
      `https://docs.google.com/document/d/${ID}/edit`,
      `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drive_link&ouid=1&rtpof=true&sd=true`,
    ];
    for (const c of casos) {
      const r = extrairIdPlanilha(c);
      expect(r.ok, c).toBe(false);
    }
    const xlsx = extrairIdPlanilha(casos[4]);
    expect(!xlsx.ok && xlsx.erro).toMatch(/formato do Excel/);
  });
  it('vazio e texto qualquer dão erro com orientação', () => {
    const v = extrairIdPlanilha('   ');
    expect(!v.ok && v.erro).toMatch(/Cole o link/);
    const q = extrairIdPlanilha('minha planilha');
    expect(!q.ok && q.erro).toMatch(/docs\.google\.com\/spreadsheets/);
  });
});

describe('chave da conta de serviço (validação local)', () => {
  const chave = (extra: Record<string, unknown> = {}) => JSON.stringify({
    type: 'service_account', project_id: 'reviza-planilha',
    private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    client_email: 'reviza-sync@reviza-planilha.iam.gserviceaccount.com', ...extra,
  });
  it('aceita a chave e devolve só o e-mail e o projeto', () => {
    expect(validarChaveLocal(chave())).toEqual({ ok: true, email: 'reviza-sync@reviza-planilha.iam.gserviceaccount.com', projeto: 'reviza-planilha' });
  });
  it('recusa texto que não é JSON, JSON de OAuth e tipo errado', () => {
    expect(validarChaveLocal('isto não é json').ok).toBe(false);
    const oauth = validarChaveLocal(JSON.stringify({ installed: { client_id: 'x' } }));
    expect(!oauth.ok && oauth.erro).toMatch(/OAuth/);
    expect(validarChaveLocal(chave({ type: 'authorized_user' })).ok).toBe(false);
    expect(validarChaveLocal('[1,2]').ok).toBe(false);
  });
  it('recusa chave sem e-mail ou sem chave privada', () => {
    const semEmail = validarChaveLocal(chave({ client_email: '' }));
    expect(!semEmail.ok && semEmail.erro).toMatch(/e-mail/);
    const semPk = validarChaveLocal(chave({ private_key: 'abc' }));
    expect(!semPk.ok && semPk.erro).toMatch(/chave privada/);
  });
});

describe('passos, conclusão e saúde', () => {
  const base = (): EstadoSync => ({ ...estadoIndisponivel(), modo: 'previa' });
  const pronto = (): EstadoSync => ({
    ...base(),
    planilha: { id: ID, url: 'u' },
    conta: { email: 'e@x', enviadaEm: '2026-10-19T12:00:00Z' },
    teste: { ok: true, quando: '2026-10-19T12:01:00Z', abas: [], clientes: 1, localidade: null, fuso: null, erro: null },
    aplicadaEm: '2026-10-19T12:05:00Z',
    configuradaEm: '2026-10-19T12:05:00Z',
    automatico: true,
  });

  it('passos são sequenciais (um passo só conta se os anteriores contam)', () => {
    const e = { ...pronto(), teste: null };
    const p = passosConcluidos(e);
    expect(p).toEqual({ link: true, acesso: true, chave: true, teste: false, conferir: false, automatico: false });
    expect(etapaPlanilhaConcluida(e)).toBe(false);
  });
  it('acesso confirmado na tela conta antes de a chave existir', () => {
    const e = { ...base(), planilha: { id: ID, url: 'u' } };
    expect(passosConcluidos(e).acesso).toBe(false);
    expect(passosConcluidos(e, true).acesso).toBe(true);
  });
  it('etapa concluída = aplicada + automático; indisponível nunca conclui nem aparece', () => {
    expect(etapaPlanilhaConcluida(pronto())).toBe(true);
    expect(etapaPlanilhaConcluida({ ...pronto(), automatico: false })).toBe(false);
    expect(etapaPlanilhaConcluida({ ...pronto(), modo: 'indisponivel' })).toBe(false);
    expect(syncVisivel(estadoIndisponivel())).toBe(false);
    expect(syncVisivel(pronto())).toBe(true);
  });
  it('saúde: freio > conferir > erro > testar > desligada > ok', () => {
    const e = pronto();
    expect(saudeSync(e)).toBe('ok');
    expect(saudeSync({ ...e, automatico: false })).toBe('desligada');
    expect(saudeSync({ ...e, teste: null })).toBe('testar'); // chave trocada
    const erro = { ...e, ultimaRodada: { id: 'r', quando: '', origem: 'automatica' as const, resultado: 'erro' as const, daPlanilha: 0, paraPlanilha: 0, duracaoMs: 1, mensagem: null } };
    expect(saudeSync(erro)).toBe('erro');
    expect(saudeSync({ ...erro, teste: null })).toBe('erro'); // o bloco de erro já traz o teste
    expect(saudeSync({ ...erro, teste: null, exigeConferencia: true })).toBe('conferir');
    expect(saudeSync({ ...erro, freio: { detectadoEm: '', motivo: '', grupos: [] } })).toBe('freio');
    expect(saudeSync(base())).toBe('pendente');
  });
  it('"há quanto tempo" em pt-BR', () => {
    const agora = new Date('2026-10-19T15:00:00Z');
    expect(haQuanto('2026-10-19T14:59:40Z', agora)).toBe('agora há pouco');
    expect(haQuanto('2026-10-19T14:57:00Z', agora)).toBe('há 3 min');
    expect(haQuanto('2026-10-19T12:00:00Z', agora)).toBe('há 3 h');
    expect(haQuanto('2026-10-18T12:00:00Z', agora)).toBe('há 1 dia');
  });
});
