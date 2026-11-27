// reviza-planilha-sync/google.ts — conta de serviço do Google SEM lib:
// JWT RS256 assinado via WebCrypto → access_token (cache em memória até exp−60s)
// + os 4 pontos da Sheets API v4 que a sincronização usa:
//   · spreadsheets.get (locale/fuso/abas — o "testar")
//   · values:batchGet com FORMATTED_VALUE (a leitura da rodada)
//   · values:batchUpdate com USER_ENTERED (o push)
//   · batchUpdate insertDimension (linha nova no fim da seção NOVOS)
// A CHAVE da conta de serviço passa por aqui só em memória e NUNCA entra em
// log, retorno ou mensagem de erro (os erros carregam apenas status/código).

export interface CredencialGoogle {
  client_email: string;
  private_key: string;
  project_id: string | null;
}

export type CodigoGoogle = 'sem_acesso' | 'formato_excel' | 'falha';

export class ErroGoogle extends Error {
  codigo: CodigoGoogle;
  status: number;
  constructor(codigo: CodigoGoogle, status: number, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

/* ================= credencial ================= */

/** mesma validação leve do front (validarChaveLocal): nada é guardado aqui */
export function lerCredencial(texto: string): { ok: true; cred: CredencialGoogle } | { ok: false; erro: string } {
  let j: unknown;
  try { j = JSON.parse(texto); } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido. Envie o arquivo .json baixado em Chaves → Adicionar chave → Criar nova chave → JSON.' };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { ok: false, erro: 'O arquivo não tem o formato de uma chave do Google.' };
  }
  const o = j as Record<string, unknown>;
  if (o.type !== 'service_account') {
    if ('installed' in o || 'web' in o) {
      return { ok: false, erro: 'Este arquivo é de um "ID do cliente OAuth", não de uma conta de serviço. Crie a chave dentro da conta reviza-sync (passo anterior).' };
    }
    return { ok: false, erro: 'Este arquivo não é a chave de uma conta de serviço do Google.' };
  }
  const email = typeof o.client_email === 'string' ? o.client_email.trim() : '';
  if (!email || !email.includes('@')) {
    return { ok: false, erro: 'A chave está incompleta: falta o e-mail da conta de serviço. Baixe uma chave nova.' };
  }
  const pk = typeof o.private_key === 'string' ? o.private_key : '';
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pk)) {
    return { ok: false, erro: 'A chave está incompleta: falta a chave privada. Baixe uma chave nova.' };
  }
  const projeto = typeof o.project_id === 'string' && o.project_id.trim() ? o.project_id.trim() : null;
  return { ok: true, cred: { client_email: email, private_key: pk, project_id: projeto } };
}

function pemParaPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END)[A-Z ]*PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importarChave(cred: CredencialGoogle): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'pkcs8',
    pemParaPkcs8(cred.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** importa o PEM e assina um byte: valida a chave LOCALMENTE, sem chamar o Google */
export async function testarAssinatura(cred: CredencialGoogle): Promise<void> {
  const chave = await importarChave(cred);
  await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode('reviza'));
}

/* ================= token (JWT RS256) ================= */

const b64url = (dados: Uint8Array | string): string => {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cacheToken: { email: string; token: string; expiraEm: number } | null = null;

export async function tokenGoogle(cred: CredencialGoogle): Promise<string> {
  const agora = Date.now();
  if (cacheToken && cacheToken.email === cred.client_email && agora < cacheToken.expiraEm) return cacheToken.token;
  const iat = Math.floor(agora / 1000);
  const claims = {
    iss: cred.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };
  const corpo = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const chave = await importarChave(cred);
  const assinatura = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo)));
  let r: Response;
  try {
    r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpo}.${b64url(assinatura)}` }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroGoogle('falha', 0, 'o Google não respondeu a tempo (token)');
  }
  // nunca repassar o corpo do erro: ele pode ecoar a assertion
  if (!r.ok) { await r.body?.cancel(); throw new ErroGoogle(r.status === 403 ? 'sem_acesso' : 'falha', r.status, `token do Google: HTTP ${r.status}`); }
  const d = await r.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  const token = String(d?.access_token ?? '');
  if (!token) throw new ErroGoogle('falha', r.status, 'token do Google: resposta sem access_token');
  cacheToken = { email: cred.client_email, token, expiraEm: agora + (Number(d?.expires_in ?? 3600) - 60) * 1000 };
  return token;
}

/* ================= Sheets API v4 ================= */

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';

async function gapi(cred: CredencialGoogle, caminho: string, init: RequestInit = {}): Promise<unknown> {
  const token = await tokenGoogle(cred);
  let r: Response;
  try {
    r = await fetch(BASE + caminho, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroGoogle('falha', 0, 'o Google não respondeu a tempo');
  }
  const t = await r.text();
  if (!r.ok) {
    if (r.status === 403 || r.status === 404) {
      throw new ErroGoogle('sem_acesso', r.status, `o Google recusou o acesso à planilha (HTTP ${r.status})`);
    }
    if (r.status === 400 && /not supported for this document/i.test(t)) {
      throw new ErroGoogle('formato_excel', r.status, 'a planilha está no formato do Excel (modo de compatibilidade)');
    }
    throw new ErroGoogle('falha', r.status, `o Google respondeu HTTP ${r.status}`);
  }
  return t ? JSON.parse(t) : null;
}

export interface AbaInfo { titulo: string; sheetId: number; linhas: number; colunas: number }
export interface InfoPlanilha { locale: string; timeZone: string; abas: AbaInfo[] }

/** spreadsheets.get — locale, fuso e abas (usado no 'testar' e para achar o sheetId do push) */
export async function obterPlanilha(cred: CredencialGoogle, planilhaId: string): Promise<InfoPlanilha> {
  const fields = 'properties(locale,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))';
  // deno-lint-ignore no-explicit-any
  const d = await gapi(cred, `${encodeURIComponent(planilhaId)}?fields=${encodeURIComponent(fields)}`) as any;
  return {
    locale: String(d?.properties?.locale ?? ''),
    timeZone: String(d?.properties?.timeZone ?? ''),
    abas: ((d?.sheets ?? []) as { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[])
      .map((s) => ({
        titulo: String(s.properties?.title ?? ''),
        sheetId: Number(s.properties?.sheetId ?? 0),
        linhas: Number(s.properties?.gridProperties?.rowCount ?? 0),
        colunas: Number(s.properties?.gridProperties?.columnCount ?? 0),
      })),
  };
}

/** values:batchGet FORMATTED_VALUE — devolve uma matriz de textos por range (célula ausente = '') */
export async function lerValores(cred: CredencialGoogle, planilhaId: string, ranges: string[]): Promise<string[][][]> {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  // deno-lint-ignore no-explicit-any
  const d = await gapi(cred, `${encodeURIComponent(planilhaId)}/values:batchGet?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&${q}`) as any;
  const vrs = (d?.valueRanges ?? []) as { values?: unknown[][] }[];
  return ranges.map((_r, i) =>
    ((vrs[i]?.values ?? []) as unknown[][]).map((row) => row.map((c) => (c == null ? '' : String(c)))));
}

/** values:batchUpdate USER_ENTERED — o push escreve tudo numa chamada só */
export async function escreverValores(
  cred: CredencialGoogle, planilhaId: string, data: { range: string; values: string[][] }[],
): Promise<void> {
  if (!data.length) return;
  await gapi(cred, `${encodeURIComponent(planilhaId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

/** batchUpdate insertDimension — insere linhas em branco DEPOIS da linha indicada (1-based) */
export async function inserirLinhas(
  cred: CredencialGoogle, planilhaId: string, sheetId: number, aposLinha: number, quantas = 1,
): Promise<void> {
  await gapi(cred, `${encodeURIComponent(planilhaId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: aposLinha, endIndex: aposLinha + quantas },
          inheritFromBefore: true,
        },
      }],
    }),
  });
}
