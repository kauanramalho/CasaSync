# Agendador de lembretes em segundo plano

O workflow `.github/workflows/reminders.yml` chama a API oficial a cada cinco
minutos (minutos 2, 7, 12, ... 57, UTC), independentemente de uma aba aberta.
O GitHub Actions usa um runner Linux padrao: gratuito enquanto este repositorio
continuar publico. Nao cria Cron pago, worker, banco, armazenamento ou plano novo.
Nao ha um pagamento avulso necessario para ativar este agendador.

## Configuracao

- GitHub / Actions secret: `REMINDER_SCHEDULER_TOKEN` aleatorio com pelo menos
  32 caracteres, gerado com um gerador criptografico.
- Render / CasaSync-api: `REMINDER_SCHEDULER_ENABLED=true` e
  `REMINDER_SCHEDULER_TOKEN_SHA256`, contendo apenas o hash SHA-256 desse token.
  A credencial original fica somente no secret do GitHub, sem sair em logs.
- GitHub / Actions variable: `REMINDER_SCHEDULER_ENABLED=true`.
- Web Push continua dependendo de `WEB_PUSH_ENABLED`, VAPID e preferencias
  e inscricoes de cada dispositivo. Nenhuma credencial de banco, SMTP ou VAPID
  precisa ser copiada para o GitHub.
- `VAPID_SUBJECT` precisa ser uma URI de contato `mailto:` ou `https:` valida,
  nao um email sem prefixo. Em producao foi corrigido para o dominio oficial
  HTTPS, preservando as chaves existentes. Ver [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292#section-2.1).

A tela de notificacoes confirma a inscricao deste dispositivo no servidor para
a conta e familia ativas. Permissao local ou uma inscricao antiga nao comprovam
ativacao. Ao trocar de familia, confirme/ative novamente nesse dispositivo;
a inscricao permanece limitada a uma familia, sem ampliar o envio para outras.

A rota `POST /api/notifications/reminders/scheduled` exige a credencial exclusiva
do agendador. JWT de usuario nao libera processamento global. Sem a flag e sem
credencial forte, a rota falha fechada. A resposta contem somente contadores.
O cliente nao segue redirecionamentos e nao registra corpos de erro ou segredos.
O workflow nao roda em forks, branches alternativas, repositorios privados ou
pull requests.

## Duplicatas, limites e fallback

Browser e agendador usam o mesmo service. Um advisory lock transacional do
PostgreSQL impede dois processadores de enviarem o mesmo lote simultaneamente,
inclusive usando a conexao pooled do Neon. O lock usa uma conexao dedicada e
e liberado ao fechar a transacao mesmo em caso de erro.
Chaves persistidas de deduplicacao e campos `sent` continuam preservados.
O progresso e salvo por lembrete; nenhum envio externo garante entrega exatamente
uma vez se o processo cair depois de enviar e antes de salvar o resultado.

A chamada agendada processa no maximo 25 lembretes por lote e verifica um
orcamento de 45 segundos entre lembretes. Um lembrete ja iniciado termina antes
da proxima verificacao; cada chamada Web Push tem timeout de 20 segundos.
Lotes restantes continuam pendentes para a proxima chamada. Preferencias por
usuario, familia, tarefas concluidas/arquivadas e membros ativos sao respeitados.
Polling no frontend e notificacoes internas permanecem como fallback.

## Limites operacionais

- O GitHub pode atrasar ou descartar uma execucao em periodos de carga alta.
  Esta solucao nao promete entrega no minuto exato.
- Apos 60 dias sem atividade no repositorio publico, o GitHub desativa schedules.
  Reativar em Actions quando isso ocorrer; nao gerar commits artificiais.
- iPhone/iPad precisam do PWA adicionado a Tela de Inicio, iOS/iPadOS 16.4 ou
  superior e permissao de notificacoes. Foco, bateria e preferencias do sistema
  podem alterar a exibicao do balao em qualquer plataforma.
- A gratuidade e do agendador. Outros provedores e o trafego excedente do Render
  mantem suas regras de cobranca; cadastrar cartao nao cria um teto geral.
- Se o repositorio ficar privado, desabilitar e revisar orcamento antes de manter
  o schedule. Nao usar runners maiores nem adicionar cache/artifacts neste job.

## Validacao e rollback

No PowerShell, a partir de `backend`:

```powershell
.venv/Scripts/python.exe -m unittest tests.test_notifications tests.test_push_security tests.test_reminder_scheduler -v
```

Em GitHub Actions, executar manualmente `CasaSync background reminders`, conferir
os contadores e confirmar uma notificacao de teste no dispositivo inscrito com
o app em segundo plano. Sucesso HTTP prova processamento; `push_sent` prova
aceitacao do provedor, nao a exibicao de um balao em todos os dispositivos.

Para desativar, mudar a variable GitHub `REMINDER_SCHEDULER_ENABLED=false`,
desativar o workflow ou mudar a flag Render para `false`. Nenhuma migracao ou
reversao de dados e necessaria. Remover/rotacionar o token no GitHub e atualizar
o hash no Render.

Fontes: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Evidencias da publicacao — 2026-10-08

- Agendador: commit `b368299`, Render `dep-db44hv5r1irc739fft50` LIVE;
  readiness HTTP 200, chamada sem credencial recusada com HTTP 401.
- GitHub variable de ativacao confirmada `true`, secret cadastrado sem aparecer
  em codigo/logs. Nenhum recurso pago criado e nenhum pagamento executado.
- Execucao manual inicial [37872267399](https://github.com/kauanramalho/CasaSync/actions/runs/37872267399)
  concluida com sucesso e contadores zerados (nenhum lembrete vencido).
- Teste controlado com a aba do CasaSync fora da tela:
  [37872650431](https://github.com/kauanramalho/CasaSync/actions/runs/37872650431)
  criou um lembrete interno, sem falha; push pulado por inscricao nao confirmada.
  A permissao local aparecia ativa. Dispositivo reinscrito e UI corrigida para
  confirmar conta, familia, chaves, opt-in e estado ativo no servidor.
- Checks depois da correcao da UI: 215 testes backend e 118 frontend aprovados;
  ESLint, build Vite com `VITE_API_URL=https://casasync-api.onrender.com/api`,
  actionlint e `git diff --check` aprovados. O build sem URL HTTPS de producao
  foi corretamente recusado pelo guardrail existente.
- Validacao em telefone fisico e exibicao do balao pelo sistema operacional
  devem ser registradas separadamente; nao inferir entrega a partir de HTTP 200.
- O envio real revelou `VapidException`: `VAPID_SUBJECT` estava sem prefixo URI.
  A configuracao foi corrigida sem rotacionar chaves. Logs seguros registram
  somente classe de erro/status; `alembic/env.py` preserva os loggers existentes
  depois das migracoes de startup (`disable_existing_loggers=False`).
- Configuracao corrigida no Render `dep-db44v1jl550s73aj3f9g` LIVE; frontend
  `dpl_6buRm9yL8MdKEBtT8JSJAsvF97NF` READY no alias oficial, commit `b312e17`.
- Teste real [37874495212](https://github.com/kauanramalho/CasaSync/actions/runs/37874495212):
  `scanned=1`, `created=1`, `push_sent=1`, `push_failed=0`, sem aba CasaSync aberta
  na conta testada. A repeticao [37874528644](https://github.com/kauanramalho/CasaSync/actions/runs/37874528644)
  retornou todos os contadores zero: nenhum envio duplicado.
- O usuario informou que o balao ainda nao apareceu. Diagnostico local somente
  leitura confirmou `Notifications\\Settings\\Chrome: Enabled=0` no Windows.
  Orientado a ativar Chrome/banners nas configuracoes do sistema; nao houve
  alteracao automatica dessas preferencias. Exibicao visual continua pendente.
  O usuario confirmou que estavam desativadas e informou que as ativou;
  reteste apos essa mudanca deve ser registrado separadamente.
- Workflow ativo e schedule configurado; evento automatico `schedule` ainda nao
  observado nesta sessao. Os testes acima foram `workflow_dispatch`, nao cron.

Arquivos alterados: `.env.example`, `.github/workflows/reminders.yml`,
`backend/reminder_scheduler.py`, `backend/app/core/config.py`,
`backend/app/routes/notifications.py`, `backend/app/services/notification_service.py`,
`backend/app/services/reminder_lock.py`, `backend/tests/test_reminder_scheduler.py`,
`backend/tests/test_push_security.py`, `frontend/src/services/api.js`,
`frontend/src/pages/Settings.jsx`, `backend/alembic/env.py`,
`backend/tests/test_migrations.py` e este documento. Sem migracao de banco.
