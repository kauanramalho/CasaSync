# CasaSync — usabilidade de tarefas e categorias

Data: 2026-10-09. Publicação no app oficial autorizada explicitamente pelo usuário após os testes.

## Entrega

- Detalhes da tarefa incluem **Excluir tarefa** no Dashboard, Tarefas e Calendário. A edição fica na aba Tarefas; as ações de concluir e de sincronizar com Google Agenda foram preservadas.
- Calendário mensal, semanal, lista, painel do dia e próximos compromissos usam a mesma confirmação de exclusão. Cancelar mantém o contexto; chamadas simultâneas de exclusão são bloqueadas.
- Confirmação informa que anexos e lembretes também serão removidos e que a ação não pode ser desfeita. A opção de remover um evento vinculado do Google Agenda segue o contrato já existente do backend.
- Nova tarefa começa pelo formulário manual. IA, lembretes e opções adicionais ficam recolhidos. A criação manual continua redirecionando ao Dashboard.
- Google Agenda mantém seleção por criação, com controle compacto reutilizável e indisponibilidade explícita quando a integração ou data/horário não permitem sincronização.
- Configurações ganha aba IA. A preferência de priorizar sugestões seguras pertence à conta **neste navegador/aparelho**; as instruções personalizadas permanecem no servidor, por conta, compartilhadas entre aparelhos.
- Analisar imagens não cria tarefas. Mesmo com a preferência de alta confiança, há revisão e confirmação final. Sugestões incertas permanecem editáveis e possuem caminho explícito para criação após revisão.
- Biblioteca de categorias usa cartões compactos, três colunas em telas pequenas. Criar/editar abre um diálogo sob demanda, com foco contido, retorno de foco e ações acessíveis sem depender da rolagem interna do formulário.
- Rótulos de membros mostram Líder/Membro; Dashboard deixa de buscar categorias e membros que não usa mais.

## Arquivos

Frontend: `src/pages/{Dashboard,Tasks,Calendar,NewTask,Categories,Settings}.jsx`; `src/components/{TaskDetailsModal,TaskDeleteConfirmModal,ImageTaskImportPanel,AssigneePicker,AISettings,GoogleCalendarOptIn}.jsx`; `src/hooks/{useTaskDeletion,useAIQuickReview}.js`; `src/utils/aiImportPreferences.js`; `tests/taskUsability.test.mjs`.

QA: `backend/tests/ui_fixture.py` amplia dados sintéticos, permite PUT local e usa a mesma sessão SQLite descartável para o processamento de eventos em segundo plano.

Nenhuma alteração de autenticação, regras de família/permissões, schema, migração, segredos, modelo de IA, credenciais, planos pagos ou código de produção do backend. O servidor de QA usa banco em memória, escuta apenas em loopback e não importa `app.main` nem executa migrações.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Sem erros |
| Testes frontend | 134 passaram, 0 falharam; 7 testes de regressão novos |
| Testes backend | 243 passaram |
| Build Vite com API oficial | Passou |
| `git diff --check` | Passou |
| HTTP isolado | Login 200; instruções salvas e relidas; criação 201; exclusão 200; tarefa excluída retorna 404 |
| Importação HTTP de sugestões sintéticas | Modo seguro criou 1 e manteve 1 pendente; confirmação manual criou o item revisado |
| Navegador local | Criação manual redirecionou ao Dashboard; descrição persistiu; preferência e instruções sobreviveram ao recarregamento; criação e edição de categoria funcionaram |
| Exclusão na interface | Detalhes e atalhos de exclusão abriram confirmação; cancelar preservou tarefa e contexto. Não foi clicada confirmação de exclusão em dados reais |
| Navegação de teclado | Diálogo de categoria fecha com Escape e devolve foco ao cartão de origem |

Testes de regressão que inspecionam o código-fonte são complementares, não substituem os testes de comportamento do navegador.

### Responsividade

Chrome com viewport controlado: **320×568, 390×844, 844×390, 768×1024 e 1366×768**.

Sem transbordamento horizontal no formulário de nova tarefa, biblioteca/editor de categorias, lista/detalhes do Calendário e Configurações > IA. As três seções da criação começaram fechadas. Ações de salvar categorias e excluir nos detalhes permaneceram acessíveis nos cinco tamanhos. Conferidos temas claro Roxo Moderno e GPT Escuro; isso não equivale a teste físico em cada sistema operacional.

### Limitações explícitas

- Teste visual de upload/análise de imagem dispensado pelo usuário; não houve chamada real à OpenAI nesta rodada.
- Não foram testados aparelhos físicos Android/iPhone/iPad nem Safari. Os testes de viewport não comprovam comportamento nativo, teclado virtual ou entrega de push nesses aparelhos.
- Nenhuma tarefa real foi criada, alterada ou excluída durante a validação de produção.
- Alertas de depreciação Starlette/httpx e reflexão de índices SQLite na suíte backend não causaram falhas. O aviso de sessão divergente do servidor descartável foi corrigido apenas na fixture e o smoke HTTP foi repetido sem esse erro.
- Não foram modificados cobrança, scheduler ou infraestrutura; o limite financeiro declarado pelo usuário permanece fora desta alteração.

## Comandos reproduzíveis — PowerShell

Na pasta `frontend` do repositório:

```powershell
npm.cmd run lint
node --test tests/*.test.mjs
$env:VITE_API_URL = 'https://casasync-api.onrender.com/api'
npm.cmd run build
```

Na pasta `backend` do repositório:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe -m tests.ui_fixture
```

O último comando é apenas para QA local e deve ser encerrado após o uso. Para a UI isolada, executar Vite em outro PowerShell na pasta `frontend`, com `VITE_API_URL=http://localhost:8000/api`.

## Publicação e retorno seguro

Preservar os serviços existentes: frontend `casa-sync` em <https://casa-sync.vercel.app> e backend `CasaSync-api` em <https://casasync-api.onrender.com>. Publicar via `main` e verificar SHA e estado READY/LIVE dos provedores, HTTP 200 e superfícies oficiais em leitura. Não cadastrar novos serviços nem substituir variáveis.

Base anterior para retorno: `6518446f006ee06a6cbcf3d8f901113b0513e31f`. Se necessário, reverter somente o commit desta entrega e republicar, ou restaurar o deployment anterior pelo provedor com autorização. Não usar reset destrutivo nem apagar dados.

## Próximo teste operacional

Com usuário e aparelhos reais: confirmar a disposição em Android/iOS/Safari e, quando autorizado, upload de imagem fictícia com revisão final. Não atribuir a esta entrega uma validação física ou integração real que não foi executada.
