# Lembretes, Google Agenda e Responsaveis

Use este guia antes de alterar notificacoes, lembretes, email, push, Google Agenda ou responsaveis de tarefas.

## Lembretes internos

- Modelo principal: `TaskReminder` em `backend/app/models/task.py`, tabela `task_reminders`, com `task_id`, `family_id`, `value`, `unit`, `reminder_at` e `sent`.
- Campos legados de tarefa: `reminder_enabled`, `reminder_value`, `reminder_unit`, `reminder_at`, `reminder_sent`. Eles continuam como espelho do primeiro lembrete para compatibilidade com dados e telas antigas.
- UI de formulario: `frontend/src/components/TaskReminderFields.jsx`.
- Validacoes frontend: `frontend/src/utils/taskReminders.js`.
- Backend configura lembretes em `backend/app/services/task_service.py`, especialmente `_sync_task_reminders`.
- Processamento: `backend/app/services/notification_service.py` busca linhas vencidas de `TaskReminder`, nao concluidas e `sent=false`.
- Endpoint manual/protegido: `POST /api/notifications/reminders/process`.
- Barra/lista de notificacoes: `notificationsApi` em `api.js` e componentes/hooks de notificacao no frontend.

## Anti-duplicidade de notificacoes

- `notification_service.py` monta `dedupe_key` no formato `task-reminder:{family_id}:{task_id}:{reminder_at}:{user_id}`.
- O service marca cada `TaskReminder.sent=True` depois do processamento e atualiza `task.reminder_sent` quando todos foram enviados.
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
- Modelos de integracao: `GoogleCalendarUserConnection` guarda tokens por usuario; `GoogleCalendarFamilySettings` guarda o modo por usuario + familia; `GoogleCalendarConnection` permanece como legado/fallback.
- Campos da tarefa: `google_calendar_event_id`, `google_calendar_id`, `google_calendar_sync_enabled`, `google_calendar_synced_at` e `google_calendar_synced_by_id`.
- Tokens devem ficar criptografados no backend e nunca ir para o frontend.
- Status/conectar/desconectar aparecem nas configuracoes por meio de `integrationsApi`.
- Sync de tarefa usa `sync_task_to_calendar`, valida familia/membro, usa a configuracao da familia ativa para eventos novos e usa `task.google_calendar_id` para editar/excluir eventos ja vinculados.
- Modos por familia: `primary` cria na agenda principal com a familia no titulo/metadados; `family_calendar` usa uma agenda separada salva em `GoogleCalendarFamilySettings`; `disabled` bloqueia sync naquela familia.
- Evento Google e montado por `create_calendar_event_from_task`, com timezone padrao `America/Sao_Paulo`, duracao padrao configuravel, `reminders.overrides` para cada lembrete valido e `extendedProperties.private` com IDs da task/familia/usuario.
- Responsaveis entram na descricao do evento; nao virar convidados automaticamente.

## Responsaveis

- Modelo legado: `Task.assignee_id`.
- Modelo atual para multiplos: `TaskAssignee` com `task.assignee_links` e propriedade `assignee_ids`.
- UI: `AssigneePicker` para selecionar, `AssigneeStack`/`TaskList` para exibir.
- Backend: `_set_task_assignees`, `_payload_assignee_ids` e `require_family_member` em `task_service.py`.
- Importacao IA: `task_import_service.py` resolve `assigneeIds` explicitos, tenta casar `responsible` por nome/email e cai para criador quando incerto com warning.
- Nunca aceitar responsavel que nao pertence a familia ativa.

## Limitacoes atuais

- O CasaSync suporta multiplos lembretes por tarefa, mas os campos legados ainda precisam ser preservados para compatibilidade.
- Processamento de lembretes existe como service/endpoint; cron/job de producao deve ser configurado fora sem endpoint publico inseguro.
- Email/push dependem de credenciais e suporte do navegador/PWA.
- Google Agenda requer conexao por usuario e horario confiavel; tarefa sem horario nao deve ser sincronizada automaticamente.
- Duplicidade de calendario e notificacoes e defensiva, nao substitui auditoria em mudancas grandes.
