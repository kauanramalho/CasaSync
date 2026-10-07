# Atualização de famílias e UX móvel — 2026-10-07

## Estado

Implementação e validação locais concluídas para as mudanças de interface. **Sem commit, push ou deploy deste lote.** Não houve migração, alteração de credenciais ou de regras de autenticação/permissões.

Notificações em telefone permanecem com aceitação operacional pendente; não são declaradas prontas para entrega com o app suspenso.

## Entregas

- `Famílias e membros` abre a gestão existente com uma lista de todas as participações, foto, cargo e indicação de líder/ativa. Selecionar um grupo carrega sua gestão. Edição continua permitida a owner/admin; exclusão continua restrita ao owner no backend, com confirmação explícita e bloqueio durante a requisição.
- Criação manual bem-sucedida de tarefa volta ao Dashboard. Importação por IA mantém seu relatório e revisão existentes.
- Navegação abaixo de 1024 px usa menu lateral, com Escape, retorno do foco, contenção de Tab, fechamento ao navegar e bloqueio de rolagem do fundo. Desktop preserva sidebar.
- Família ativa no cabeçalho móvel inicia recolhida e pode ser expandida; a foto permanece acessível e o seletor também está no menu lateral.
- Fotos de famílias nos seletores e na lista; imagem ausente/quebrada usa inicial como fallback.
- Recorte compartilhado de perfil/família: arrastar, zoom com dois ponteiros, botões +/−, setas, centralizar, confirmar/cancelar. Modal via portal evita corte por cards com backdrop/filter. Mesma geometria calcula prévia e arquivo final. Limites de upload e otimização existentes foram mantidos.
- Compartilhar convite usa a folha nativa do dispositivo: nome de quem convida, família, código e URL do app. Inclui o ícone público se arquivos forem suportados; fallback copia mensagem+URL. Cancelar não envia nem copia novamente. A rede social decide quais partes do conteúdo aceita e como mostra a imagem.
- Dashboard: proteção de largura/textos na seção de atenção, ícone sem encolher e metadados sem margem excessiva no celular. Cabeçalho/logotipo compacto com truncamento do nome.
- Calendário: corrigido `ReferenceError: taskDateKey is not defined`, encontrado ao abrir a tela com tarefa datada. Usa `calendarDateKey` existente e timezone nas dependências. Lint `no-undef` aplicado à página para evitar recorrência.
- Web Push: inscrição inicial aguarda worker ativo; clique em notificação fica na origem do app; tags determinísticas existentes preservadas, fallback evita agrupar notificações distintas. Configurações explicam requisitos e controle do balão pelo sistema.

## Validações executadas

No PowerShell, a partir da raiz do repositório, usando a virtualenv do backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests
# 147 testes: OK
```

No PowerShell, a partir de `frontend`:

```powershell
node --test tests/*.test.mjs
# 51 testes: aprovados
npm.cmd run lint
# aprovado
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
# aprovado; variável apenas neste processo, nenhum .env alterado
```

`git diff --check` aprovado; avisos de conversão LF/CRLF não são falhas.

Build inicial sem override recusou o localhost da configuração local, conforme a proteção de produção. Refeito com a URL HTTPS explícita acima.

### Navegador local isolado

`backend/tests/ui_fixture.py` executa os routers/services reais sobre SQLite em memória, usuário sintético, duas famílias e tarefa atrasada com título longo. Não importa startup de produção nem executa migrações no banco configurado. Providers externos desativados. Servidores restritos ao loopback; dados desaparecem ao encerrar o processo.

```powershell
# Terminal 1, backend
.\.venv\Scripts\python.exe -m tests.ui_fixture
# Terminal 2, frontend
$env:VITE_API_URL='http://localhost:8000/api'
npm.cmd run dev -- --host 127.0.0.1
```

- 10 telas × 4 larguras: 320, 390, 768 e 1366 px. Dashboard, tarefas, nova tarefa, calendário, categorias, famílias, ranking, casal, relatórios, configurações. Todas abriram e não apresentaram escape horizontal fora de contêineres de rolagem previstos. Gráficos/filtros que já usam scroll interno permanecem assim.
- Inspeção visual do menu, seção `Precisa de atenção`, recorte e perfil em celular.
- Criação manual real no banco de teste redirecionou para `/` e apareceu no Dashboard.
- Fotos recortadas de família e perfil foram salvas pelos endpoints reais no banco isolado.
- Troca para participação `member`: exclusão ausente e edição desabilitada. Backend testou rejeição de admin ao excluir, rejeição de outsider ao editar, e sucesso de owner com fallback de família ativa.
- Testes do recorte cobrem imagens quadradas, horizontais e verticais; limites e equivalência de geometria preview/output.
- Testes de Web Push cobrem worker ainda instalando, notificação de fundo, conteúdo inválido, tags e abertura apenas na origem.

Não equivalem a teste de todos os modelos de telefone, todas as combinações de conteúdo, leitores de tela ou envio real por redes sociais. Gesto multitoque foi implementado e ainda precisa de teste físico.

## Notificações: evidência e pendências

Leitura autenticada na conta QA já existente em `https://casa-sync.vercel.app/configuracoes`, aba Notificações: **Push configurado no servidor**, permissão deste navegador **ainda não solicitada**. Nenhuma permissão foi concedida nem envio real disparado.

No código, processamento é chamado pelo polling do frontend e pelo endpoint protegido `/api/notifications/reminders/process`. Não existe agendador autônomo no backend inspecionado. Um agendador externo de produção **não foi confirmado**, portanto não afirmar ausência absoluta nem entrega confiável quando todos os clientes estão suspensos.

Próximo gate operacional:

1. Confirmar se existe job externo; caso não, autorizar/configurar processamento periódico no servidor, reutilizando `process_due_task_reminders`, sem tornar endpoint público e preservando dedupe/flags.
2. Usuário habilitar push no telefone. iOS/iPadOS 16.4+ exige app adicionado à Tela de Início.
3. Validar tarefa com lembrete, dispositivo inscrito e app suspenso; conferir balão, abertura e ausência de duplicata. Concluídas e sem lembrete não devem alertar.

Fontes: [WebKit — Web Push em iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [MDN — Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API).

## Arquivos deste lote

- Layout/páginas: `frontend/src/layouts/AppLayout.jsx`, `pages/{Family,NewTask,Dashboard,Calendar,Settings}.jsx`.
- Componentes: `components/{FamilyAvatar,ImageCropEditor,ImageAdjustField,LogoMark,SelectMenu}.jsx`, `hooks/useDialogFocus.js`.
- Utilitários: `utils/{familyInvite,imageCrop,files,pushNotifications}.js`, `frontend/public/sw.js`, `frontend/eslint.config.js`.
- Testes: `frontend/tests/{familyInvite,imageCrop,serviceWorker,pushNotifications}.test.mjs`, `backend/tests/test_multi_family_context.py`, `backend/tests/ui_fixture.py`.
- Este relatório.

## Preservação e publicação

Alterações prévias em `backend/tests/test_migrations.py`, `docs/CONNECTIVITY_RECOVERY.md`, `STATUS.md` e migração `20261007_0002_family_member_ai_aliases.py` foram preservadas, sem mistura com este lote. Banco e deploy atuais não foram alterados.

Publicação requer autorização explícita. Rollback do lote consiste em reverter somente os arquivos/commit deste lote; não exige downgrade de banco. Após publicação, repetir smoke de login, família, criação de tarefa, fotos e navegação, e verificar atualização do service worker.
