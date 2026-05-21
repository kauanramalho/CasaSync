# Google Agenda no CasaSync

Esta integracao permite que cada usuario conecte a propria conta Google e envie tarefas confirmadas do CasaSync para o Google Calendar. A funcionalidade continua desativada por padrao e so roda quando `GOOGLE_CALENDAR_ENABLED=true`.

## Estado atual

- OAuth real usa authorization code flow no backend.
- Tokens ficam criptografados em `google_calendar_connections`.
- O frontend nunca recebe `access_token`, `refresh_token` ou `client_secret`.
- A conexao e escopada por usuario e familia ativa.
- A sincronizacao de tarefa usa `backend/app/services/calendar_service.py`.
- Nenhum evento e criado sem clique explicito do usuario.
- Uma tarefa ja vinculada por `google_calendar_event_id` nao cria evento duplicado.
- Antes de criar, o service tambem procura evento com `extendedProperties.private.casasyncTaskId`.

## Variaveis

Use valores reais apenas no ambiente seguro. Nunca commit `.env`.

```env
GOOGLE_CALENDAR_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/integrations/google-calendar/callback
GOOGLE_CALENDAR_DEFAULT_TIMEZONE=America/Sao_Paulo
GOOGLE_CALENDAR_DEFAULT_EVENT_MINUTES=60
GOOGLE_CALENDAR_REQUEST_TIMEOUT_SECONDS=20
INTEGRATION_TOKEN_ENCRYPTION_KEY=
FRONTEND_URL=http://localhost:5173
```

`INTEGRATION_TOKEN_ENCRYPTION_KEY` deve ser uma chave longa e exclusiva do ambiente. Se ela mudar, tokens ja salvos nao poderao ser descriptografados.

## Endpoints

- `GET /api/integrations/google-calendar/status`
- `GET /api/integrations/google-calendar/connect-url`
- `GET /api/integrations/google-calendar/callback`
- `POST /api/integrations/google-calendar/disconnect`
- `POST /api/integrations/google-calendar/tasks/{task_id}/sync`

Todos exigem usuario autenticado, exceto o callback do Google, que valida `state` assinado e expiravel antes de salvar qualquer conexao.

## Google Cloud

1. Crie ou selecione um projeto no Google Cloud.
2. Ative a Google Calendar API.
3. Configure a tela de consentimento OAuth.
4. Crie um OAuth Client ID do tipo Web application.
5. Adicione o redirect URI local:
   `http://localhost:8000/api/integrations/google-calendar/callback`
6. Coloque `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` apenas no ambiente local/seguro.
7. Em app de teste, adicione o usuario como test user quando necessario.

## Como testar localmente

1. Configure o backend com `GOOGLE_CALENDAR_ENABLED=true`, `FRONTEND_URL=http://localhost:5173`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `INTEGRATION_TOKEN_ENCRYPTION_KEY`.
2. Rode backend e frontend.
3. Entre no CasaSync e acesse Configuracoes > Google Agenda.
4. Clique em Conectar Google Agenda e conclua o OAuth no Google.
5. Volte para Configuracoes e confirme status conectado.
6. Abra Calendario, escolha uma tarefa com data/hora e clique em Sincronizar com Google Agenda.
7. Confirme no modal do navegador.
8. Confira que a tarefa recebe `google_calendar_event_id` e que uma nova tentativa retorna que ela ja esta vinculada.
9. Clique em Desconectar e confirme que os tokens locais sao removidos.

## Fallback seguro

Com `GOOGLE_CALENDAR_ENABLED=false`, o CasaSync continua funcionando normalmente. Status e sincronizacao retornam mensagem segura sem exigir credenciais reais.

## Riscos

- Use HTTPS em producao para `FRONTEND_URL` e `GOOGLE_REDIRECT_URI`.
- Rotacione `INTEGRATION_TOKEN_ENCRYPTION_KEY` com plano de migracao; troca direta invalida tokens antigos.
- O projeto ainda usa upgrades aditivos em `init_db.py`; antes de producao, preferir migracoes Alembic versionadas.
