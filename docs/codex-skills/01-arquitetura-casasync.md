# Arquitetura CasaSync

Use este guia antes de mudancas estruturais no CasaSync. Ele resume onde as pecas vivem e quais fronteiras nao devem ser atravessadas sem mapear impacto.

## Visao geral

- Frontend: React/Vite em `frontend/src`, com rotas em paginas, componentes reutilizaveis e `frontend/src/services/api.js` como cliente unico da API.
- Backend: FastAPI em `backend/app`, separado em `routes`, `services`, `schemas`, `models`, `core` e `database`.
- Banco: SQLAlchemy models em `backend/app/models`. O projeto usa `Base.metadata.create_all` e upgrades aditivos em `backend/app/database/init_db.py`; nao ha uma camada Alembic tradicional neste momento.
- Contexto principal: usuario autenticado, familia ativa, membros/responsaveis, categorias, tarefas, anexos, lembretes, IA por imagem e Google Agenda.

## Backend

- `backend/app/core/config.py`: variaveis de ambiente, feature flags, CORS, OpenAI, Google Calendar, email, web push, storage local.
- `backend/app/core/deps.py`: dependencias de autenticacao e familia ativa, incluindo `get_current_user` e `get_family_id`.
- `backend/app/routes/`: superficies HTTP. Evite colocar regra de negocio aqui quando existir ou couber um service.
- `backend/app/services/`: regra de negocio centralizada. `task_service.py`, `task_import_service.py`, `image_analysis_service.py`, `calendar_service.py`, `notification_service.py` e `task_attachment_service.py` sao pontos criticos.
- `backend/app/models/`: entidades persistidas. `task.py`, `family.py`, `user.py`, `notification.py`, `integration.py`, `category.py` concentram os dominios principais.
- `backend/app/schemas/`: contratos Pydantic usados nas rotas.
- `backend/storage/task_attachments/`: armazenamento local privado de anexos de tarefas em desenvolvimento.

## Frontend

- `frontend/src/App.jsx`: rotas principais e layout autenticado.
- `frontend/src/pages/`: telas de alto nivel como `Dashboard.jsx`, `Tasks.jsx`, `NewTask.jsx`, `Settings.jsx`, `Family.jsx`, `Calendar.jsx`.
- `frontend/src/components/`: componentes compartilhados como `TaskList`, `TaskEditorModal`, `ImageTaskImportPanel`, `TaskAttachmentField`, `TaskReminderFields`, `SelectMenu`, `DateTimePicker`, `Badges`.
- `frontend/src/services/api.js`: unico lugar para chamadas HTTP, token, upload, download e normalizacao da URL da API.
- `frontend/src/utils/`: formatacao, ordenacao, anexos, lembretes, importacao de sugestoes da IA e eventos internos.
- `frontend/src/styles.css`: tokens visuais, temas, `soft-input`, `glass-panel`, cards, calendario e ajustes dark/light.

## Fluxos principais

- Autenticacao: frontend usa `authApi` em `api.js`; backend valida em `routes/auth.py`, `services/auth_service.py` e models de usuario/2FA. Nunca expor se email/username existe em erro de login.
- Familia ativa: rotas sensiveis recebem `family_id` via dependencia backend. Nao aceitar `familyId` do frontend para operacoes criticas quando a familia ativa deve ser inferida.
- Tarefas: `pages/NewTask.jsx` e `pages/Tasks.jsx` chamam `tasksApi`; backend entra por `routes/tasks.py`; criacao/edicao/listagem/conclusao ficam em `services/task_service.py`.
- Categorias: `categoriesApi` e `category_service.py`. Categorias devem pertencer a familia atual.
- Responsaveis: `Task.assignee_id` ainda existe por compatibilidade, mas a relacao principal para multiplos responsaveis e `TaskAssignee`/`assignee_ids`.
- Anexos: `TaskAttachmentField` usa endpoints em `routes/tasks.py`; `task_attachment_service.py` valida tipo real, tamanho, familia/tarefa e storage privado.
- Lembretes/notificacoes: campos de lembrete ficam em `Task`; `notification_service.py` cria notificacoes internas e opcionalmente email/push atras de feature flags.
- IA por imagem: `ImageTaskImportPanel` envia imagens para `/image-analysis/task-suggestions/jobs`, acompanha por polling, backend chama `image_analysis_job_service.py`, `image_analysis_service.py` e `ai_vision_adapter.py`; criacao real passa por `/tasks/import-suggestions`.
- Google Agenda: configuracao e OAuth em `calendar_service.py` e rotas de `integrations`; sync de tarefa deve validar usuario, familia e conexao do usuario.

## Regras de arquitetura

- Services sao a fonte de verdade para regra de negocio; componentes e rotas so orquestram.
- Toda mudanca em auth, familia, permissao, tarefa, anexo, lembrete, IA ou Google deve ser incremental e reversivel.
- Nunca salvar dados vindos de IA sem validacao backend; quando houver modo automatico, o service deve filtrar itens arriscados.
- Nunca logar chaves, tokens, conteudo de imagem, payload cru da IA, dados pessoais sensiveis ou caminhos fisicos de anexos.
- Mudancas de banco devem ser aditivas e preservar dados existentes.
