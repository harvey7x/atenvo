/* "Exportar planilha" (25/11, como o botão de baixar do CRM do sistema que a Reviza usava antes). CSV no formato que o
   Excel em português abre direto com dois cliques: separador ";", aspas onde precisa, BOM para os acentos e CRLF.
   Lógica pura + o download no navegador. */
export function csvDe(linhas: (string | number | null | undefined)[][]): string {
  const cel = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v);
    // fórmula injetada ("=", "+", "-", "@") não vira fórmula no Excel
    const seguro = /^[=+\-@]/.test(s) ? "'" + s : s;
    return /[;"\r\n]/.test(seguro) ? '"' + seguro.replace(/"/g, '""') + '"' : seguro;
  };
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n') + '\r\n';
}

export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : nomeArquivo + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const dataBr = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
/** "kanban-2026-11-25" */
export const nomeComData = (base: string) => `${base}-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}`;
