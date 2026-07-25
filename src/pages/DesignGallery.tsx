/* /design — vitrine INTERNA E TEMPORÁRIA da biblioteca Obsidian (Fase 2).
 *
 * Existe para revisar todos os componentes e estados lado a lado num lugar só.
 * Sai do app quando a migração terminar (Fase 4). Fica atrás do login de
 * propósito — não é página pública.
 *
 * Nota sobre a regra "máximo 1 botão primário por vista": esta página é uma
 * FOLHA DE ESPÉCIMES — mostra o primário em vários estados de uma vez. A regra
 * vale para as telas reais, não para o catálogo delas. */
import { useState } from 'react';
import {
  AlertTriangle, Archive, Inbox, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2,
} from 'lucide-react';
import {
  AmbientOrbs, Badge, Button, Card, Dropdown, EmptyState, Field, Input, Modal,
  Select, Skeleton, Table, Td, Textarea, Th, Tooltip, UiToastProvider, useUiToast,
} from '@/components/ui';

/* Amostras de cor DINÂMICA: são valores reais salvos hoje no banco (etiquetas.cor /
 * funil_colunas.cor). Representam DADOS, não estilo — o componente Badge os dessatura
 * em runtime via tintDeHex, que é exatamente o que a Fase 3 fará nas telas. */
const CORES_REAIS_DO_BANCO = ['#e11d48', '#3b82f6', '#f59e0b', '#7a5bb0', '#0e7490', '#be185d'];

const sec: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', margin: 0 };
const meta: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' };

function Amostras() {
  const toast = useUiToast();
  const [modalMd, setModalMd] = useState(false);
  const [modalLg, setModalLg] = useState(false);

  return (
    <div style={{ position: 'relative', zIndex: 'var(--z-content)' as never, maxWidth: 980, margin: '0 auto', padding: 'var(--space-7) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', margin: 0 }}>Biblioteca Obsidian</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 'var(--space-1) 0 0' }}>
          Fase 2 — todos os componentes e estados num lugar só. Página temporária, some no fim da migração.
        </p>
      </header>

      {/* ---------------- tokens: superfícies e texto ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Tokens — escada de superfícies e texto</h2>
        <div style={row}>
          {(['--bg-canvas', '--surface-1', '--surface-2', '--surface-3'] as const).map((t) => (
            <div key={t} style={{ width: 150 }}>
              <div style={{ height: 56, background: `var(${t})`, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }} />
              <div style={meta}>{t}</div>
            </div>
          ))}
        </div>
        <div style={row}>
          <span style={{ color: 'var(--text-primary)' }}>texto primário</span>
          <span style={{ color: 'var(--text-secondary)' }}>texto secundário</span>
          <span style={{ color: 'var(--text-muted)' }}>meta e placeholder (nunca informação essencial)</span>
          <span style={{ color: 'var(--accent-text)' }}>acento em texto</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>1.234,56 (tabular)</span>
        </div>
      </section>

      {/* ---------------- botões ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Botão — 4 variantes × estados</h2>
        <div style={row}>
          <Button variant="primary"><Plus size={16} strokeWidth={1.5} />Ação principal</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive"><Trash2 size={16} strokeWidth={1.5} />Excluir</Button>
        </div>
        <div style={row}>
          <Button variant="primary" disabled>Desabilitado</Button>
          <Button variant="secondary" disabled>Desabilitado</Button>
          <Button variant="primary" loading>Salvando</Button>
          <Button variant="secondary" loading>Carregando</Button>
          <Button variant="secondary" className="ui-focus-demo">Foco (demonstração)</Button>
        </div>
        <div style={row}>
          <Button variant="secondary" size="sm">Pequeno 28</Button>
          <Button variant="secondary">Padrão 32</Button>
          <Button variant="secondary" size="lg">Grande 36</Button>
          <span style={meta}>hover e active: passe o mouse / clique e segure</span>
        </div>
      </section>

      {/* ---------------- campos ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Campos — input, select, textarea</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
          <Field label="Nome do cliente" hint="Como aparece no WhatsApp">
            <Input placeholder="Maria da Silva" />
          </Field>
          <Field label="Com erro" error="Informe um telefone válido">
            <Input aria-invalid="true" defaultValue="51 9999" />
          </Field>
          <Field label="Desabilitado">
            <Input disabled defaultValue="Somente leitura" />
          </Field>
          <Field label="Canal">
            <Select defaultValue="ura">
              <option value="ura">URA</option>
              <option value="andrius">ANDRIUS</option>
              <option value="oficial">Número oficial</option>
            </Select>
          </Field>
          <Field label="Foco (demonstração)">
            <Input className="ui-focus-demo" placeholder="Anel de foco accent" />
          </Field>
          <Field label="Observações">
            <Textarea placeholder="Texto livre, redimensionável na vertical" />
          </Field>
        </div>
      </section>

      {/* ---------------- cards ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Card — opaco (conteúdo) e glass (destaque fixo)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Card>
            <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>Card opaco</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 'var(--space-2) 0 0' }}>
              Padrão para listas e conteúdo denso. Fundo surface-1, borda hairline.
            </p>
          </Card>
          <Card glass>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Conversas hoje</div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>1.284</div>
            <div style={meta}>glass: só em superfície fixa e única — nunca em item de lista</div>
          </Card>
        </div>
      </section>

      {/* ---------------- tabela ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Tabela densa</h2>
        <Table>
          <thead>
            <tr><Th>Cliente</Th><Th>Canal</Th><Th>Situação</Th><Th num>Mensagens</Th></tr>
          </thead>
          <tbody>
            <tr><Td>Maria da Silva</Td><Td meta>URA</Td><Td><Badge variant="accent">Em atendimento</Badge></Td><Td num>128</Td></tr>
            <tr><Td>José Araujo</Td><Td meta>ANDRIUS</Td><Td><Badge variant="warning">Aguardando cliente</Badge></Td><Td num>7</Td></tr>
            <tr><Td>Bruna Rossi</Td><Td meta>RMKT 5</Td><Td><Badge variant="success">Fechado</Badge></Td><Td num>1.043</Td></tr>
          </tbody>
        </Table>
      </section>

      {/* ---------------- badges ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Badge — variantes fixas e cor dinâmica do banco (dessaturada)</h2>
        <div style={row}>
          <Badge variant="neutral">Neutro</Badge>
          <Badge variant="accent">Acento</Badge>
          <Badge variant="success">Sucesso</Badge>
          <Badge variant="warning">Atenção</Badge>
          <Badge variant="danger">Problema</Badge>
        </div>
        <div style={row}>
          {CORES_REAIS_DO_BANCO.map((c) => <Badge key={c} hex={c}>etiqueta {c}</Badge>)}
        </div>
        <span style={meta}>a fileira de cima usa tokens; a de baixo é a cor crua salva no banco passando pela receita tint (nunca chapada)</span>
      </section>

      {/* ---------------- modal + dropdown + toast ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Modal, dropdown e toast</h2>
        <div style={row}>
          <Button variant="secondary" onClick={() => setModalMd(true)}>Abrir modal de confirmação (480)</Button>
          <Button variant="secondary" onClick={() => setModalLg(true)}>Abrir modal de formulário (640)</Button>
          <Dropdown
            trigger={(p) => <Button variant="secondary" {...p}><MoreHorizontal size={16} strokeWidth={1.5} />Ações</Button>}
            items={[
              { label: <><Pencil size={16} strokeWidth={1.5} />Editar</>, onSelect: () => {} },
              { label: <><Archive size={16} strokeWidth={1.5} />Arquivar</>, onSelect: () => {} },
              'sep',
              { label: <><Trash2 size={16} strokeWidth={1.5} />Excluir</>, onSelect: () => {}, danger: true },
            ]}
          />
          <Button variant="secondary" onClick={() => toast('Alteração salva.')}>Toast de sucesso</Button>
          <Button variant="secondary" onClick={() => toast('O canal está fora da janela.', 'warning')}>Toast de atenção</Button>
          <Button variant="secondary" onClick={() => toast('Não foi possível enviar.', 'danger')}>Toast de erro</Button>
        </div>
        <Modal
          open={modalMd}
          onClose={() => setModalMd(false)}
          title="Cancelar agendamento"
          footer={<>
            <Button variant="ghost" onClick={() => setModalMd(false)}>Voltar</Button>
            <Button variant="destructive" onClick={() => setModalMd(false)}>Cancelar agendamento</Button>
          </>}
        >
          A mensagem não será enviada. Isto não pode ser desfeito — para enviar depois é preciso agendar de novo.
        </Modal>
        <Modal
          open={modalLg}
          onClose={() => setModalLg(false)}
          size="lg"
          title="Novo modelo de mensagem"
          footer={<>
            <Button variant="ghost" onClick={() => setModalLg(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { setModalLg(false); toast('Modelo salvo.'); }}>Salvar</Button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Field label="Nome do modelo"><Input placeholder="retomada_contato" /></Field>
            <Field label="Texto"><Textarea placeholder="Olá {{1}}, tudo bem?" /></Field>
          </div>
        </Modal>
      </section>

      {/* ---------------- skeleton + empty + tooltip ---------------- */}
      <section style={sec}>
        <h2 style={h2}>Skeleton, empty state e tooltip</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Card>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton circle height={34} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Skeleton width="60%" />
                <Skeleton width="85%" height={8} />
              </div>
            </div>
          </Card>
          <Card>
            <EmptyState
              icon={Inbox}
              text="Nenhuma conversa por aqui. Quando um cliente escrever, ela aparece nesta lista."
              action={<Button variant="secondary"><Plus size={16} strokeWidth={1.5} />Nova conversa</Button>}
            />
          </Card>
        </div>
        <div style={row}>
          <Tooltip text="Buscar conversas">
            <Button variant="ghost" aria-label="Buscar"><Search size={16} strokeWidth={1.5} /></Button>
          </Tooltip>
          <Tooltip text="Configurações">
            <Button variant="ghost" aria-label="Configurações"><Settings size={16} strokeWidth={1.5} /></Button>
          </Tooltip>
          <Tooltip text="Também aparece no foco por teclado (Tab)">
            <Button variant="ghost" aria-label="Atenção"><AlertTriangle size={16} strokeWidth={1.5} /></Button>
          </Tooltip>
          <span style={meta}>ícones: lucide, stroke 1.5, 16px (18px só em destaque)</span>
        </div>
      </section>
    </div>
  );
}

export function DesignGallery() {
  return (
    <UiToastProvider>
      <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
        <AmbientOrbs />
        <Amostras />
      </div>
    </UiToastProvider>
  );
}
