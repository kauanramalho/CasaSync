# Lembretes, Google Agenda e Responsaveis

Use este guia antes de alterar notificacoes, lembretes, email, push, Google Agenda ou responsaveis de tarefas.

## Lembretes internos

- Campos de tarefa: `reminder_enabled`, `reminder_value`, `reminder_unit`, `reminder_at`, `reminder_sent`.
- UI de formulario: `frontend/src/components/TaskReminderFields.jsx`.
- Validacoes frontend: `frontend/src/utils/taskReminders.js`.
- Backend configura lembretes em `backend/app/services/task_service.py`, especialmente `_configure_task_reminder`.
- Processamento: `backend/app/services/notification_service.py` busca tarefas com lembrete vencido, nao concluidas e `reminder_sent=false`.
- Endpoint manual/protegido: `POST /api/notifications/reminders/process`.
- Barra/lista de notificacoes: `notificationsApi` em `api.js` e componentes/hooks de notificacao no frontend.

## Anti-duplicidade de notificacoes

- `notification_service.py` monta `dedupe_key` no formato `task-reminder:{family_id}:{task_id}:{reminder_at}:{user_id}`.
- O service marca `task.reminder_sent=True` depois do processamento.
- Tarefas concluidas nao devem gerar lembrete.
- Recipientes devem ser membros ativos da familia: responsaveis e criador da tarefa.

## Email e push

- Email e Web Push ficam desativados por padrao.
- Variaveis principais:
  - `EMAIL_NOTIFICATIONS_ENABLED`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME` ou `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`/`EMAIL_FROM`, `SMTP_USE_TLS`
  - `WEB_PUSH_ENABLED`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Services relevantes: `email_service.py` e `notification_service.py`.
- Preferencias por usuario: `email_task_reminders_enabled` e `push_task_reminders_enabled`.
- Nunca enviar segredo SMTP/VAPID para o frontend. Apenas chave publica VAPID pode aparecer no cliente quando necessario.
- Se email/push estiverem desativados ou sem configuracao, o app deve continuar funcionando e criar notificacao interna quando aplicavel.

## Google Agenda

- Feature flag: `GOOGLE_CALENDAR_ENABLED`.
- Configuracao: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`.
- Backend principal: `backend/app/services/calendar_service.py`.
- Provider externo: `backend/app/services/calendar_provider_adapter.py`.
- Rotas: `backend/app/routes/integrations.py`.
- Modelo de conexao: `backend/app/models/integration.py`.
- Tokens devem ficar criptografados no backend e nunca ir para o frontend.
- Status/conectar/desconectar aparecem nas configuracoes por meio de `integrationsApi`.
- Sync de tarefa usa `sync_task_to_calendar`, valida familia/membro, evita duplicar se `google_calendar_event_id` ja existir e tambem procura evento existente pelo id da tarefa.
- Evento Google e montado por `create_calendar_event_from_task`, com timezone padrao `America/Sao_Paulo` e duracao padrao configuravel.

## Responsaveis

- Modelo legado: `Task.assignee_id`.
- Modelo atual para multiplos: `TaskAssignee` com `task.assignee_links` e propriedade `assignee_ids`.
- UI: `AssigneePicker` para selecionar, `AssigneeStack`/`TaskList` para exibir.
- Backend: `_set_task_assignees`, `_payload_assignee_ids` e `require_family_member` em `task_service.py`.
- Importacao IA: `task_import_service.py` resolve `assigneeIds` explicitos, tenta casar `responsible` por nome/email e cai para criador quando incerto com warning.
- Nunca aceitar responsavel que nao pertence a familia ativa.

## Limitacoes atuais

- O CasaSync suporta um lembrete por tarefa; multiplos lembretes exigem evolucao de modelo.
- Processamento de lembretes existe como service/endpoint; cron/job de producao deve ser configurado fora sem endpoint publico inseguro.
- Email/push dependem de credenciais e suporte do navegador/PWA.
- Google Agenda requer conexao por usuario e horario confiavel; tarefa sem horario nao deve ser sincronizada automaticamente.
- Duplicidade de calendario e notificacoes e defensiva, nao substitui auditoria em mudancas grandes.
