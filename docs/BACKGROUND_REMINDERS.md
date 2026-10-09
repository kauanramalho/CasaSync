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
O push usa `TTL=3600` (uma hora) e `Urgency: high` para lembretes: a validade zero
padrao da biblioteca descartava mensagens para dispositivos indisponiveis.
O provedor pode reduzir essa janela e o sistema controla a exibicao; nao e um
retry da aplicacao, nem ignora Modo Foco/permissoes. Ver [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030#section-5.2).

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
  reteste [37874902020](https://github.com/kauanramalho/CasaSync/actions/runs/37874902020)
  enviou um push sem falha, e o usuario confirmou: "Apareceu sim".
- Correcao da validade zero: commit `ea8b1e2`, Render `dep-db454a9srm7s738a8io0`
  LIVE e Vercel `dpl_EHBQetuxywNjna4Ai6CksMuVWGNm` READY. Backend completo:
  `.venv/Scripts/python.exe -m unittest discover -s tests -v`: 215 testes OK;
  Ruff F821/F823/F401 aprovado. Teste automatizado verifica TTL, urgencia e timeout.
  A chamada [37875349346](https://github.com/kauanramalho/CasaSync/actions/runs/37875349346)
  confirmou execucao sem erros, mas nao tinha lembretes pendentes; nao comprova
  entrega a dispositivo offline. O teste Windows confirmado acima precede TTL.
- Android: usuario informa permissoes ativas e ausencia de balao. Solicitada tela
  Configuracoes > Notificacoes para conferir registro da conta/familia; nao
  concluir causa sem essa evidencia. iOS tambem permanece na lista de validacao
  fisica, mediante iPhone disponivel e PWA instalado. Nao anunciar "100%".
- Workflow ativo e schedule configurado; evento automatico `schedule` ainda nao
  observado nesta sessao. Os testes acima foram `workflow_dispatch`, nao cron.

Comandos de qualidade (PowerShell, caminhos relativos ao repositorio):

```powershell
Set-Location backend
.venv/Scripts/python.exe -m unittest discover -s tests -v
uvx --offline ruff check app/routes/notifications.py app/services/notification_service.py tests/test_push_security.py tests/test_migrations.py alembic/env.py --select F821,F823,F401
Set-Location ../frontend
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
Set-Location ..
git diff --check
```

Arquivos alterados: `.env.example`, `.github/workflows/reminders.yml`,
`backend/reminder_scheduler.py`, `backend/app/core/config.py`,
`backend/app/routes/notifications.py`, `backend/app/services/notification_service.py`,
`backend/app/services/reminder_lock.py`, `backend/tests/test_reminder_scheduler.py`,
`backend/tests/test_push_security.py`, `frontend/src/services/api.js`,
`frontend/src/pages/Settings.jsx`, `backend/alembic/env.py`,
`backend/tests/test_migrations.py` e este documento. Sem migracao de banco.

## Teste direto por dispositivo — 2026-10-09

- A captura Android enviada pelo usuario mostra permissao `permitida`, mas a
  tela pede `Ativar neste dispositivo`: registro para a conta/familia atual nao
  confirmado. Permissao do sistema nao equivale a inscricao ativa no servidor.
- Novo botao `Testar notificacao` em Configuracoes > Notificacoes, disponivel
  depois da ativacao. `POST /api/notifications/push-subscriptions/test` exige
  usuario autenticado, membro da familia ativa, opt-in, feature flag/VAPID e
  inscricao ativa com endpoint e ambas as chaves correspondentes.
- Somente essa inscricao recebe um payload fixo, sem dados de tarefas ou familia.
  Nao cria tarefas, notificacoes internas nem modifica preferencias. Usa o mesmo
  transporte seguro dos lembretes, timeout 20 s, TTL 300 s e urgencia alta.
- Limite de uma tentativa por conta/minuto, inclusive tentativas com falha,
  usando o limitador em memoria existente. Vale por processo; escala horizontal
  ou reinicio requerem revisao desse limite. Tag por minuto substitui duplicatas
  no aparelho. Nao promete exatamente um envio em falhas de rede/reinicio.
- Aceitacao do provedor nao prova exibicao: mensagem da tela deixa essa diferenca
  explicita. Inscricoes expiradas (404/410) sao desativadas; erros nao divulgam
  respostas, endpoints ou credenciais. Testar nao reinscreve outros aparelhos.
- Backend: 228 testes aprovados (13 novos), Ruff F821/F823/F401 aprovado.
  Frontend: dois testes novos exercitam POST autenticado/familia, resposta de
  aceitacao e falhas 409/429/502 sem reenvio automatico; lint e build aprovados.
- Recepcao Android ainda depende de ativar e confirmar o alerta no aparelho.
  Teste direto pode chegar com app em primeiro plano: depois, testar um lembrete
  futuro com o app em segundo plano para validar a entrega pelo agendador.
- iOS fisico pendente: usuario informou nao ter iPhone disponivel agora. Nao
  considerar simulacao de layout ou teste Windows como validacao de Web Push iOS.
- Nenhum pagamento, plano ou recurso pago novo necessario para esta mudanca.
- Publicacao do codigo `c537295`: Render `dep-db45kfs9v7es73aairdg` LIVE,
  Vercel `dpl_9HWA5V4Cc3BWypmpsBXZosKdt94w` READY no alias oficial. Readiness
  HTTP 200 e teste sem login HTTP 401. Botao acionado no Chrome real: resposta
  `Teste aceito pelo provedor`; nenhum erro de transporte encontrado na consulta
  especifica de logs apos o deploy. Isso nao comprova nova recepcao visual.
- Suite frontend completa: 120 testes aprovados. Android aguarda ativacao e
  confirmacao do usuario; iOS permanece nao verificado sem aparelho disponivel.

Comandos adicionais (PowerShell):

```powershell
Set-Location backend
.venv/Scripts/python.exe -m unittest tests.test_push_device_test tests.test_push_security tests.test_notifications tests.test_reminder_scheduler
uvx --offline ruff check app/routes/notifications.py app/schemas/notification.py app/services/notification_service.py tests/test_push_device_test.py --select F821,F823,F401
Set-Location ../frontend
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
```

Arquivos desta mudanca: `backend/app/schemas/notification.py`,
`backend/app/services/notification_service.py`, `backend/app/routes/notifications.py`,
`backend/tests/test_push_device_test.py`, `frontend/src/services/api.js`,
`frontend/src/pages/Settings.jsx`, `frontend/tests/pushDeviceApi.test.mjs` e este
documento. Rollback: reverter o commit desta mudanca e republicar; sem migracao
ou alteracao de dados existentes (exceto desativacao segura de inscricao expirada).

## Icone pequeno da notificacao Android — 2026-10-09

O usuario confirmou recepcao do teste direto com captura do Android: o icone
grande estava correto, mas o pequeno junto ao nome do app aparecia como quadrado.
O service worker usava o favicon opaco de 32 px como `badge`. Nesse campo o Android
aplica uma mascara: fundo opaco vira uma silhueta quadrada, nao a marca.
Fontes: [Google/web.dev](https://web.dev/articles/push-notifications-display-a-notification#badge)
e [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

- Novo `notification-badge-96.png`: marca existente branca sobre transparencia,
  96x96, com margem; gerada deterministicamente pelo gerador de icones atual.
- `sw.js` usa o badge dedicado versionado, precache e cache `casasync-static-v3`.
  Mantem icone grande, tag/dedupe, `renotify=false`, payload e comportamento de clique.
  Remove apenas caches antigos do proprio CasaSync, preservando outros caches.
- Nao muda autenticacao, familia, inscricoes, preferencias, VAPID ou agendador.
  Icones opacos de instalacao/iOS e seis temas continuam identicos no Git.
- Cinco testes novos validam pixels transparentes/monocromaticos, tamanho,
  reproducibilidade, opcoes de push, fallback malformado, precache e upgrade.
  Suite frontend: 125 OK; backend de notificacoes: 38 OK; ESLint, build e diff OK.
- Confirmada recepcao Android do teste anterior; a nova aparencia precisa de
  reteste fisico apos atualizar o worker. Notificacoes antigas ja exibidas nao
  mudam. Abrir o app e tocar `Atualizar` no aviso de nova versao, depois testar.
- iOS continua sem aparelho disponivel, portanto nao verificado fisicamente.
- O aviso Render da captura pertence ao site alternativo `casasync.onrender.com`
  (`CasaSync`, static site), com erro `API nao configurada. Defina VITE_API_URL`.
  API principal `CasaSync-api` estava LIVE em `c537295`. Nenhuma configuracao do
  site alternativo foi modificada; ele nao e o dominio oficial Vercel.

Arquivos: `frontend/public/sw.js`, `frontend/public/icons/notification-badge-96.png`,
`frontend/tools/iconArtwork.mjs`, `frontend/tools/generate-icons.mjs`,
`frontend/tests/notificationBadge.test.mjs` e este documento. Rollback: reverter
o commit e publicar no mesmo projeto Vercel; nenhuma migracao ou chave nova.

Comandos PowerShell, em `frontend`:

```powershell
npm.cmd run icons:generate
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
git diff --check
```

Em `backend`: `.venv/Scripts/python.exe -m unittest tests.test_push_device_test tests.test_push_security tests.test_notifications tests.test_reminder_scheduler`.
