# Google Agenda no CasaSync

Esta base prepara a integracao futura com Google Agenda sem exigir credenciais reais e sem criar eventos externos automaticamente.

## Estado atual

- A integracao fica desativada por padrao com `GOOGLE_CALENDAR_ENABLED=false`.
- O frontend pode consultar status e exibir mensagens seguras.
- O backend ja tem service, adapter de provider, rota de status, URL OAuth preparada, callback seguro e endpoint de sincronizacao por tarefa.
- A escrita real no Google Calendar API ainda nao esta ativa.
- Nenhum token, client secret, refresh token ou access token deve ser commitado.

## Variaveis

Use apenas valores reais no ambiente seguro de desenvolvimento/producao, nunca no repositorio.

```env
GOOGLE_CALENDAR_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/integrations/google-calendar/callback
GOOGLE_CALENDAR_DEFAULT_TIMEZONE=America/Sao_Paulo
GOOGLE_CALENDAR_DEFAULT_EVENT_MINUTES=60
```

## Endpoints preparados

- `GET /api/integrations/google-calendar/status`
- `GET /api/integrations/google-calendar/connect-url`
- `GET /api/integrations/google-calendar/callback`
- `POST /api/integrations/google-calendar/tasks/{task_id}/sync`

Todos os fluxos de usuario/familia passam pelo backend. A sincronizacao de tarefa usa a familia ativa resolvida no servidor e busca a tarefa com escopo da familia.

## Conversor tarefa para evento

O conversor esta em `backend/app/services/calendar_service.py:create_calendar_event_from_task`.

Ele mapeia:

- `task.title` para `summary`;
- `task.description` e categoria para `description`;
- `task.due_date` para `start`;
- duracao padrao para `end`;
- `GOOGLE_CALENDAR_DEFAULT_TIMEZONE` para timezone do evento;
- lembrete do CasaSync para popup do Google quando existir;
- `casasyncTaskId` em propriedades privadas para idempotencia futura.

## Como testar desabilitado

1. Garanta `GOOGLE_CALENDAR_ENABLED=false` ou ausente.
2. Rode backend e frontend normalmente.
3. Abra Configuracoes > Google Agenda.
4. Confirme a mensagem de integracao desativada.
5. Chame `POST /api/integrations/google-calendar/tasks/{task_id}/sync` com usuario autenticado e confirme resposta segura `status=disabled`.
6. Crie tarefas normalmente para garantir que o fluxo antigo nao foi afetado.

## Proximo passo para OAuth real

Antes de ativar em producao:

1. Implementar troca de `code` por tokens no adapter.
2. Criptografar tokens antes de salvar em `GoogleCalendarConnection`.
3. Validar `state` com expiracao e protecao contra reuso.
4. Adicionar fluxo de desconexao e revogacao.
5. Implementar busca de duplicatas por `casasyncTaskId` antes de criar evento.
6. Manter toda escrita dependente de clique explicito do usuario.

## Riscos

- Sem criptografia de tokens, OAuth real nao deve ser ativado.
- Sem busca/update de evento existente, escrita real poderia duplicar eventos.
- A familia ativa ainda e resolvida pelo backend; nao aceite `familyId` do frontend para sincronizar.
