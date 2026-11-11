#!/usr/bin/env bash
# Gera o pacote de deploy da Reviza (build de produção + zip pronto p/ Square Cloud).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DEP="$RAIZ/deploy/reviza"
cd "$RAIZ"
echo "» build:reviza…"
# carimbo de versão visível no rodapé do menu (Reviza) — tira a dúvida de "qual build está no ar"
export VITE_BUILD_TS="$(date +%d/%m\ %H:%M)"
echo "  versão: $VITE_BUILD_TS"
npm run build:reviza
echo "» copiando dist…"
rm -rf "$DEP/dist" && cp -R "$RAIZ/dist" "$DEP/dist"
# SW real agora é sw-r3.js (gerado pelo vite). Os nomes LEGADOS viram kill-switch:
# resgatam quem está preso no sw.js (bug 11/09) ou no sw-r2.js (bug 17/09, edge
# envenenado). Quando o edge da região evictar a cópia velha, o reg.update() pega
# o kill-switch → limpa caches, desregistra e recarrega → a aba renasce no sw-r3.js.
cp "$DEP/sw-kill.js" "$DEP/dist/sw.js"
cp "$DEP/sw-kill.js" "$DEP/dist/sw-r2.js"
echo "» zipando…"
cd "$DEP"
rm -f reviza-squarecloud.zip
zip -rq reviza-squarecloud.zip squarecloud.app server.js package.json dist
echo "✓ pronto: $DEP/reviza-squarecloud.zip"
