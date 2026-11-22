# Arquivo de configuração da Iris

O dono monta a Iris de cada cliente aqui (conversando com o Claude) e entrega **um arquivo**. O cliente abre
Configurações → Atendimento → Iris, clica em **Importar configuração**, escolhe o arquivo (ou cola o texto)
e confirma. A importação atualiza a atendente que já existe: a chave do Google e os números não mudam.

## Como montar

1. Copie `modelo.json` para `iris-<cliente>.json` e preencha.
2. Confira: `npx vite-node tools/iris/conferir.ts iris-<cliente>.json`
   É o mesmo código da tela. "Pode enviar" significa que a tela importa sem cortar nada.
3. Entregue o arquivo (fica em `~/Desktop`). Para corrigir depois, mande outro arquivo: o cliente importa
   de novo e escolhe "Atualizar".

## O que vai em cada campo

| Campo | O que é | Limite |
|---|---|---|
| `nome` | Como a atendente se apresenta | 120 |
| `modelo` | `gemini-3.6-flash` (recomendado), `gemini-3.7-flash` ou `gemini-pro-latest` | — |
| `personaPrompt` | Quem ela é, como fala, como qualifica, o que faz com cada documento, quando passa para uma pessoa | 20.000 caracteres |
| `conhecimento` | Fatos da empresa: o que faz, preços, prazos, endereço, perguntas frequentes | 8.000 caracteres |
| `comportamentos.horario` | Horário em que ela atende (`ativo: false` = qualquer hora) | hh:mm |
| `comportamentos.janela` | Horário em que ela pode retomar a conversa sozinha | hh:mm |
| `comportamentos.nudges_ativos` | Retorno automático quando o cliente some | sim/não |
| `comportamentos.proibidos` | Temas em que ela não entra | 50 temas de até 80 |
| `para`, `feitoEm`, `nota` | Só aparecem para quem importa, na conferência | 400 na nota |

## Roteiro da personalidade (`personaPrompt`)

Escreva em texto corrido, nesta ordem. É o que o dono chama de "explicar como a Iris vai trabalhar":

1. **Quem ela é e por quem fala**: nome, que é atendente virtual, de qual empresa.
2. **Como fala**: tom, tamanho das mensagens, o que evitar.
3. **O que a empresa oferece** e para quem.
4. **Como qualificar**: as perguntas, na ordem, e o que faz o cliente servir ou não servir.
5. **Documentos**: quais ela reconhece, o que pede e o que faz quando recebe cada um.
6. **Quando passar para uma pessoa** e o que dizer nessa hora.
7. **O que nunca dizer nem prometer.**

Regras que valem para todos (mensagem curta, segurança, nunca prometer valor) já estão no motor: não
precisa repetir.

## Regras

- **A chave do Google nunca vai no arquivo.** O conferidor recusa arquivo com cara de chave.
- **O texto que o cliente final lê é do dono.** Proponha e espere a aprovação antes de fechar o arquivo.
- Não deixe trecho do modelo entre colchetes: o conferidor avisa.
