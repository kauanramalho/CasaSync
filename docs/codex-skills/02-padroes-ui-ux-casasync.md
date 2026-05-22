# Padroes UI/UX CasaSync

Use este guia antes de criar ou alterar telas, modais, tabelas, badges ou fluxos responsivos.

## Linguagem visual

- O CasaSync usa uma estetica suave: cards claros, bordas discretas, sombras leves, cantos grandes, lavanda/rose/blush e suporte a temas.
- Os tokens principais vivem em `frontend/src/styles.css`: `--color-*`, `.soft-input`, `.glass-panel`, `.page-title`, `.section-title`, `.empty-state`, `.theme-surface`.
- Reutilize `Card`, `Button`, `PageHeader`, `StatCard`, `SelectMenu`, `DateTimePicker`, `CategoryBadge`, `PriorityBadge`, `StatusBadge` e `Avatar` antes de criar uma variante nova.
- Evite `alert()` do navegador; prefira `useToast`, alertas inline suaves e estados visuais dentro do componente.

## Inputs e seletores

- Campos padrao devem usar `.soft-input`.
- Categoria, prioridade, status e filtros devem preferir `SelectMenu`, que tem popover via portal e evita corte em modais/cards.
- Datas e horarios devem preferir `DateTimePicker`, com calendario customizado e digitacao manual de horario.
- Responsaveis devem usar `AssigneePicker` quando houver selecao de membros da familia.
- Uploads devem mostrar nome, tamanho, tipo, erro amigavel e botao de remover.

## Cards, modais e paineis

- Cards de conteudo usam `Card` ou classes equivalentes com borda suave e `shadow-card`.
- Modais devem ter backdrop, foco claro, `max-height`, scroll interno confortavel e botoes sempre acessiveis no mobile.
- Nao coloque card dentro de card sem necessidade; use secoes internas sem parecer uma pilha pesada.
- Estados de loading devem bloquear duplo clique e deixar claro o que esta acontecendo.

## Tabelas e listas

- Tarefas usam `TaskList.jsx`. Antes de criar outra tabela de tarefas, tente estender esse componente.
- Cabecalhos clicaveis, ordenacao e visual mobile devem manter a logica compartilhada de `frontend/src/utils/tasks.js`.
- Badges de status, prioridade, categoria e anexos devem continuar compactos e alinhados.
- Estados vazios precisam ser amigaveis e especificos, sem parecer erro.

## Responsividade

- Desktop pode usar grids, mas mobile deve empilhar campos e manter botoes acessiveis.
- Popovers/dropdowns/calendarios devem caber na viewport; use portal ou posicionamento defensivo quando necessario.
- Textos longos precisam truncar ou quebrar linha sem sobrepor botoes, badges ou cards.
- Validar telas em largura de notebook, tablet e celular sempre que alterar modal grande.

## Temas

- O app tem temas em `styles.css` como `professional-blue`, `nature-green`, `elegant-dark`, `minimal-neutral` e `modern-purple`.
- Nao fixe cores que quebrem dark/light. Quando usar tons diretos, prefira os tokens existentes ou classes ja usadas no projeto.
- Componentes novos devem se parecer com os existentes em Dashboard, Tarefas, Calendario, Configuracoes e Importar por imagem.

## Checklist visual rapido

- Reutilizou `Button`, `Card`, `SelectMenu`, `DateTimePicker` e badges existentes quando possivel?
- Nao introduziu select nativo cru em area refinada?
- Mensagens de erro/sucesso ficam no proprio contexto?
- Botoes tem estado disabled/loading?
- Modal ou dropdown nao corta em mobile?
- Nao removeu filtros, ordenacao, edicao, criacao, conclusao ou refresh de dados existentes?
