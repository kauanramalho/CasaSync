# Google Agenda no CasaSync

Esta integracao permite que cada usuario conecte a propria conta Google e envie tarefas confirmadas do CasaSync para o Google Calendar. A funcionalidade continua desativada por padrao e so roda quando `GOOGLE_CALENDAR_ENABLED=true`.

## Estado atual (revisao local de 2026-10-07; publicacao pendente)

- OAuth real usa authorization code flow no backend.
- Tokens ficam criptografados em `google_calendar_user_connections`, com compatibilidade de leitura para `google_calendar_connections` legado.
- O frontend nunca recebe `access_token`, `refresh_token` ou `client_secret`.
- A conexao e escopada por usuario e familia ativa.
- A sincronizacao de tarefa usa `backend/app/services/calendar_service.py`.
- Nenhum evento e criado sem clique explicito do usuario.
- Uma tarefa ja vinculada por `google_calendar_event_id` nao cria evento duplicado.
- Antes de criar, o service tambem procura evento com `extendedProperties.private.casasyncTaskId`.
- Se o evento vinculado tiver sido apagado diretamente no Google, a proxima sincronizacao limpa o vinculo invalido, procura outro evento da mesma tarefa e so entao recria se necessario.
- Um refresh token invalido ou revogado encerra a conexao local e orienta o usuario a reconectar, evitando status conectado falso.
- O callback sempre redireciona de volta para `/configuracoes` com uma mensagem segura, inclusive quando o `state` esta invalido ou expirado.
- O GET publico nunca troca nem salva tokens. O retorno valido inclui codigo/state no fragmento `#` (nao enviado ao servidor do frontend); a tela limpa a URL e faz POST autenticado para finalizar. Usuario, familia, membership e `token_version` precisam coincidir com o estado assinado. A tela espera o carregamento da familia antes de processar o retorno.

## Escopo funcional atual

- O CasaSync nao importa nem lista eventos gerais da conta Google no calendario interno.
- A integracao procura apenas eventos criados a partir de tarefas CasaSync, usando `extendedProperties.private.casasyncTaskId`.
- O scope `calendar.events` permite gerenciar eventos. `calendar.app.created` permite criar a agenda separada da familia sem pedir o scope amplo `calendar`. Conexoes antigas mantem os grants existentes; reducao retroativa exige revogacao/reconexao iniciada pelo usuario.
- Editar uma tarefa ja vinculada deixa marcada por padrao a atualizacao do mesmo evento. O usuario ainda pode desmarcar essa opcao antes de salvar.
- Um evento vinculado por outro membro nao e atualizado nem excluido usando a conexao Google desse membro. A UI orienta salvar sem sincronizar ou pedir ao proprietario da conexao para realizar a operacao, evitando copias entre contas.
- Concluir ou reabrir uma tarefa nao altera o evento externo porque o payload atual nao representa status. A tarefa e o evento continuam vinculados para futuras edicoes.
- A exclusao do evento Google e opcional no fluxo de exclusao da tarefa; desconectar a conta nunca apaga tarefas internas.

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
- `POST /api/integrations/google-calendar/complete`
- `POST /api/integrations/google-calendar/disconnect`
- `POST /api/integrations/google-calendar/tasks/{task_id}/sync`

Todos exigem usuario autenticado, exceto o GET callback do Google, que apenas valida `state` e redireciona. Somente o POST autenticado pode salvar a conexao. Publicar frontend e backend deste fluxo de forma coordenada; misturar versoes nao e compativel.

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

Em producao, `FRONTEND_URL` deve apontar para a origem publica do frontend e `GOOGLE_REDIRECT_URI` deve ser exatamente o callback HTTPS cadastrado no Google Cloud. O backend nao tenta montar essas URLs a partir da requisicao recebida.

## Gate para consentimento sem aviso de app nao verificado

Codigo e HTTPS nao substituem a verificacao do provedor. O status real do projeto Google Cloud **nao foi confirmado** nesta auditoria; nenhuma permissao de conta Google foi concedida.

1. Confirmar que o OAuth Client corresponde ao projeto real do CasaSync e que o redirect de producao e exatamente `https://casasync-api.onrender.com/api/integrations/google-calendar/callback` (sem alterar variaveis ou credenciais silenciosamente).
2. Conferir marca, contatos, dominio verificado, homepage publica e politica de privacidade coerente com os dados efetivamente tratados. Nao inventar operador legal, contato ou politica.
3. Conferir audience, modo Testing/In production, usuarios de teste e status de verificacao de marca/scopes sensiveis. `calendar.events` permanece uma permissao abrangente para eventos, mesmo sem importar eventos gerais na UI.
4. Enviar as evidencias/demonstracao exigidas pelo Google e aguardar aprovacao; colocar somente em producao nao elimina automaticamente o aviso.
5. Com autorizacao do titular, executar conexao real, sincronizacao confirmada de tarefa, repeticao sem duplicata, revogacao e reconexao. Nunca orientar a contornar o aviso de seguranca.

Fontes oficiais: [verificacao de scopes sensiveis](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [scopes Calendar](https://developers.google.com/workspace/calendar/api/auth), [criacao de calendario](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert).

## Fallback seguro

Com `GOOGLE_CALENDAR_ENABLED=false`, o CasaSync continua funcionando normalmente. Status e sincronizacao retornam mensagem segura sem exigir credenciais reais.

## Riscos

- Use HTTPS em producao para `FRONTEND_URL` e `GOOGLE_REDIRECT_URI`.
- Rotacione `INTEGRATION_TOKEN_ENCRYPTION_KEY` com plano de migracao; troca direta invalida tokens antigos.
- O projeto tem migracoes Alembic versionadas e caminhos legados de adocao em `init_db.py`; revisar esses caminhos com dados existentes antes de qualquer nova migracao. Esta auditoria nao alterou schema nem banco remoto.
