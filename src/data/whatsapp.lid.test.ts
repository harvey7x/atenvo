// Regressão @lid: o LID nunca pode virar nome do contato.
// Varre o fonte do webhook (Deno) e da data layer, sem executá-los.
import { describe, it, expect } from 'vitest';
import webhook from '../../supabase/functions/evolution-webhook/index.ts?raw';
import wa from './whatsapp.ts?raw';

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
    expect(wa).toContain('ehLidCru');
    expect(wa).toContain('ehPlaceholder');
    expect(wa).toMatch(/\/\^\[0-9\]\{12,\}\$\//);
    // placeholder só quando NÃO há telefone; com telefone mostra o número
    expect(wa).toMatch(/ehPlaceholder \? \(tel \?\? 'Identidade protegida'\)/);
  });
});
