# Subir a Reviza Cobranças no Square Cloud

O `dist/` já vem com a URL + chave pública do banco embutidas (build de produção).
Nada mais precisa ser configurado no Square Cloud.

## Opção A — pelo painel (mais simples)
1. Gere o pacote:  bash deploy/reviza/build.sh   (na raiz do projeto)
   → cria  deploy/reviza/reviza-squarecloud.zip
2. No painel do Square Cloud: **Upload application** → arraste o zip → confirmar.
3. O app sobe em  https://reviza.squareweb.app

## Opção B — pela CLI
1. npm i -g @squarecloud/cli
2. squarecloud login   (cola sua API key)
3. bash deploy/reviza/build.sh
4. squarecloud up deploy/reviza   (1º deploy)  /  squarecloud commit  (updates)

## Depois do deploy de 11/09 (o do conserto do cache) — uma vez por máquina
O /sw.js antigo ficou preso no edge-cache do Cloudflare (domínio é da Square, não
dá pra purgar). Máquina que estiver presa na versão velha: **um Cmd/Ctrl+Shift+R**
(hard refresh) resolve na hora — registra o sw-r2.js novo e dali em diante toda
atualização chega sozinha em ≤5 min (takeover). Sem o hard refresh a máquina também
se solta sozinha, mas só quando a checagem de 5 min furar o cache velho do edge:
o /sw.js agora entrega um SW "kill-switch" (sw-kill.js) que se auto-remove, limpa
os caches e recarrega a aba. Enquanto o edge da região segurar o /sw.js velho, isso
pode demorar — por isso o hard refresh é o caminho garantido.

## Regra permanente deste domínio (herança do bug do cache)
O server antigo mandou cache de 1 ano pra tudo, e o edge ainda guarda cópias velhas
de favicon.svg, icons/* e opus/* por até 1 ano (sem purge possível). Se um dia
mudar um desses arquivos, **RENOMEIE o arquivo** (e ajuste as referências) — mudar
no lugar não propaga. /assets/* não tem esse problema (nome já é hasheado), e o
server novo só deixa cachear /assets/*. NUNCA remover o sw-kill.js nem deixar o
/sw.js responder 404 (404 não desregistra SW velho — máquina presa ficaria pra
sempre; ver comentário no sw-kill.js).

## Depois do 1º deploy (uma vez só, no painel do Supabase do projeto reviza)
Authentication → URL Configuration:
- Site URL = https://reviza.squareweb.app
- Redirect URLs += https://reviza.squareweb.app
