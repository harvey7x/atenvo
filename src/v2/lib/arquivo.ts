/* Download/leitura de arquivo no navegador (export/import de fluxos e atendentes). */

/** Dispara o download de um objeto como .json (funciona no navegador real). */
export function baixarJson(nomeArquivo: string, dados: unknown): void {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo.endsWith('.json') ? nomeArquivo : `${nomeArquivo}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Lê um File como texto (para o import). Teto de tamanho evita travar a aba com um arquivo enorme
    (um fluxo/atendente cabe folgado em 2 MB; o parser ainda valida o conteúdo depois). */
export function lerArquivoTexto(file: File, maxBytes = 2_000_000): Promise<string> {
  if (file.size > maxBytes) return Promise.reject(new Error('Arquivo grande demais (máximo 2 MB).'));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    r.readAsText(file);
  });
}

/** slug simples pro nome do arquivo */
export function slugArquivo(s: string): string {
  return (s || 'sem-nome').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'sem-nome';
}
