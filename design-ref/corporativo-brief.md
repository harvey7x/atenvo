# Visual Corporativo — brief da pesquisa (29/08/2026)

Pesquisa em 5 ângulos (IBM Carbon, SAP Fiori Horizon, Salesforce Lightning,
MS Fluent 2, fintechs Stripe/Mercury/Ramp/Linear + NN/g). As fontes CONVERGEM:

1. **Superfície opaca e chapada.** Profundidade = hairline 1px (sutil/forte),
   nunca vidro/blur/glow. Sombra SÓ em overlay que flutua (menu/modal).
   Dark: camada CLAREIA um passo por nível (Carbon g100). Light: carta
   branca sobre cinza frio #F5F6F7 (Fiori Morning Horizon) — light é o
   PADRÃO enterprise nos dois gigantes.
2. **Cor quase acromática + UM azul interativo** (Carbon Blue 60 #0F62FE,
   hover #0050E6) pra botão/link/foco/seleção. Verde/âmbar/rubro só como
   STATUS (pago/pendente/vencido) — nunca decoração. Desaturar os cinzas
   é, em si, o gesto que profissionaliza (Linear).
3. **Raio 4–8px** em controle/dado; pílula = consumidor. 0 em barras
   full-bleed.
4. **Movimento = resposta, nunca teatro.** 70ms hover, 110ms fade, 150ms
   padrão, 240ms drawer; easing produtivo cubic-bezier(.2,0,.38,.9).
   PROIBIDO: cascata de entrada, contador subindo (número de cobrança é
   livro-caixa), gradiente em deriva, glow pulsando, lift no hover.
5. **Hierarquia por PESO (400/600)**, não por tamanho; corpo 13–14px;
   dinheiro em tabular-nums alinhado à direita, decimais sempre.
6. **Densidade é feature**: linha 32–40px, separador 1px, sem zebra;
   3–5 KPIs acima da dobra (regra dos 5 segundos), o mais importante
   no canto superior esquerdo.

Implementação: camada aditiva `[data-visual="corp"]` (serio.css), mesma
mecânica do Modo Leve/tema/acento. Alternador = prédio na topbar.
Sem o atributo, Platina byte-idêntica. Fontes completas: transcript da
pesquisa 29/08 (workflow pesquisa-ui-enterprise).
