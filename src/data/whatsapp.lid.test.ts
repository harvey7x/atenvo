// Regressão @lid: o LID nunca pode virar nome do contato.
// Varre o fonte do webhook (Deno) e da data layer, sem executá-los.
import { describe, it, expect } from 'vitest';
import webhook from '../../supabase/functions/evolution-webhook/index.ts?raw';
import wa from './whatsapp.ts?raw';
// a regra do nome exibido mora em whatsappRealtime.ts (fonte única: mapConversa + patch de `contatos`)
import waRt from './whatsappRealtime.ts?raw';
import { nomeDoContato } from './whatsappRealtime';

describe('@lid — o LID nunca vira nome', () => {
  it('webhook: sem PN e sem pushName real => "Identidade protegida" (nunca o lid cru)', () => {
    // não deve mais existir o fallback antigo que usava o lid como nome
    expect(webhook).not.toMatch(/\?\?\s*\(phone\s*\?\?\s*lid!?\)/);
    expect(webhook).toContain("'Identidade protegida'");
    expect(webhook).toContain('identidade_tipo');
    // grava o mapa LID↔PN por canal
    expect(webhook).toContain("from('wa_lid_map')");
    expect(webhook).toContain('canal_id: canal.id');
  });

  it('webhook v21: evento só com LID CONSULTA o mapa confirmado por org+canal+lid', () => {
    // leitura do mapa (não só escrita): filtra por confirmado=true e telefone presente
    expect(webhook).toMatch(/if \(!phone && lid\) \{[\s\S]*from\('wa_lid_map'\)[\s\S]*\.eq\('confirmado', true\)/);
    expect(webhook).toContain('resolvidoViaMapa');
    expect(webhook).toContain("'lid_resolvido_via_mapa'");
  });

  it('webhook: ao resolver PN corrige o nome placeholder e marca estado', () => {
    expect(webhook).toMatch(/identidade_tipo:\s*'telefone'/);
    expect(webhook).toMatch(/\.eq\('nome',\s*'Identidade protegida'\)/);
  });

  it('data layer: exibição defensiva não mostra LID cru; resolvido mostra telefone', () => {
    expect(wa).toContain('nomeDoContato(');          // mapConversa usa a regra única
    expect(waRt).toContain('ehLidCru');
    expect(waRt).toContain('ehPlaceholder');
    expect(waRt).toMatch(/\/\^\[0-9\]\{12,\}\$\//);
    // placeholder só quando NÃO há telefone; com telefone mostra o número
    expect(waRt).toMatch(/ehPlaceholder \? \(tel \?\? 'Identidade protegida'\)/);
    // e o comportamento
    expect(nomeDoContato('123456789012345', null, false)).toBe('Identidade protegida');
    expect(nomeDoContato('123456789012345', null, true)).toBe('123456789012345');
    expect(nomeDoContato('Identidade protegida', '5551999990000', true)).toBe('5551999990000');
    expect(nomeDoContato('Maria Souza', null, false)).toBe('Maria Souza');
    expect(nomeDoContato(null, null, false)).toBe('Contato');
  });
});
