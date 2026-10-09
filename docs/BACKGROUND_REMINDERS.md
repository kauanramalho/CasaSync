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
