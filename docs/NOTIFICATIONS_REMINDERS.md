# Lembretes e notificacoes de tarefas

Esta base entrega lembretes de tarefas em tres camadas progressivas: notificacao interna no CasaSync, email e Web Push para navegador/PWA. Email e push ficam desativados por padrao e o app continua funcionando sem nenhuma credencial.

## Variaveis de ambiente

Email:

```env
EMAIL_NOTIFICATIONS_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=true
EMAIL_FROM="CasaSync <no-reply@casasync.app>"
SMTP_FROM=
```

Push navegador/PWA:

```env
WEB_PUSH_ENABLED=false
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@casasync.app
```

Somente `VAPID_PUBLIC_KEY` pode chegar ao frontend. `SMTP_PASSWORD`, `VAPID_PRIVATE_KEY` e qualquer token de provedor devem ficar apenas no backend.

## Como funciona

- O backend procura tarefas com lembrete vencido, `reminder_enabled=true`, `reminder_sent=false` e status diferente de concluida.
- Cada notificacao interna usa uma chave de deduplicacao por familia, tarefa, horario de lembrete e usuario.
- O backend cria notificacoes apenas para responsaveis e criador que pertencem a familia da tarefa.
- Depois da varredura da tarefa, `reminder_sent` vira `true` para evitar repeticao.
- Email e push sao tentados apenas se a feature estiver habilitada, configurada e ativada pelo usuario.
- O sino do CasaSync lista as notificacoes persistidas e permite marcar como lida.

## Checagem de lembretes

Endpoint protegido para desenvolvimento e futuro agendamento:

```http
POST /api/notifications/reminders/process
```

Ele exige usuario autenticado e familia ativa. O frontend chama esse endpoint periodicamente enquanto o app esta aberto. Em producao, o proximo passo seguro e chamar o service `process_due_task_reminders` por um job interno/cron autenticado, sem expor endpoint publico sem protecao.

## Como ativar email

1. Configure SMTP no backend.
2. Defina `EMAIL_NOTIFICATIONS_ENABLED=true`.
3. No CasaSync, o usuario ativa lembretes por email em Configuracoes > Notificacoes.

Com `EMAIL_NOTIFICATIONS_ENABLED=false` ou SMTP ausente, o backend registra o canal como ignorado e nao quebra o fluxo.

## Como ativar push

1. Gere um par VAPID seguro fora do repositorio.
2. Configure `WEB_PUSH_ENABLED=true`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`.
3. No CasaSync, o usuario ativa push no dispositivo e concede permissao do navegador.

O frontend salva apenas a subscription do navegador. A chave privada VAPID nunca deve ser enviada ao cliente.

## Limitacoes de navegador/PWA

- Push depende de HTTPS fora de localhost.
- Em mobile, o comportamento varia por sistema, navegador, permissao e instalacao como PWA.
- Alguns navegadores podem nao entregar notificacoes em segundo plano ou podem pausar subscriptions antigas.
- Se uma subscription expirar ou retornar 404/410, o backend a desativa.

## Testes manuais recomendados

1. Criar tarefa pendente com lembrete proximo.
2. Rodar `POST /api/notifications/reminders/process`.
3. Confirmar notificacao interna no sino.
4. Rodar a checagem novamente e confirmar que nao duplica.
5. Concluir a tarefa antes da checagem e confirmar que nao notifica.
6. Testar com `EMAIL_NOTIFICATIONS_ENABLED=false`.
7. Testar com `WEB_PUSH_ENABLED=false`.
8. Ativar push em navegador compativel e confirmar a permissao.
9. Marcar notificacao como lida.
10. Validar que usuario fora da familia nao acessa notificacoes daquela familia.

## Pendencias futuras

- Criar job de producao dedicado para chamar `process_due_task_reminders` em intervalo controlado.
- Adicionar preferencias mais granulares por familia ou por tipo de tarefa, se o produto precisar.
- Registrar historico detalhado de tentativas de email/push em tabela propria se auditoria fina for necessaria.
