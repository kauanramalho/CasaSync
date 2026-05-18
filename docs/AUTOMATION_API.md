# CasaSync Automation API

Esta camada permite que ferramentas externas, como o Codex, criem e mantenham tarefas e compromissos no CasaSync depois de interpretarem textos, prints ou listas fora do app.

O CasaSync nao faz OCR, nao le imagens, nao usa IA propria, nao cria OAuth do Google, nao usa Google Agenda e nao sincroniza calendarios externos.

## Endpoints

- `POST /api/automation/tasks`: cria tarefas/compromissos em lote.
- `POST /api/automation/appointments`: alias do endpoint acima, para chamadas que tratam tudo como compromisso.
- `PATCH /api/automation/tasks/{task_id}`: edita campos de um item criado ou existente.
- `POST /api/automation/tasks/{task_id}/reschedule`: remarca data e horario.
- `POST /api/automation/tasks/{task_id}/cancel`: cancela removendo o item do CasaSync.

Todos exigem `Authorization: Bearer <token>`. Se o usuario tiver mais de uma familia, use `?family_id=<id-da-familia>`; sem isso, a API usa a familia principal do usuario.

## Campos Principais

Cada item de criacao aceita:

- `title`: titulo do item.
- `description`: descricao opcional.
- `date`: data em `YYYY-MM-DD`.
- `time`: horario em `HH:MM`.
- `timezone`: opcional; padrao `America/Sao_Paulo`.
- `responsible`: nome, username ou email de um membro da familia.
- `responsible_id`: alternativa mais precisa ao `responsible`.
- `category`: nome de uma categoria existente na familia.
- `category_id`: alternativa mais precisa ao `category`.
- `priority`: `low`, `medium`, `high`, `baixa`, `media` ou `alta`.
- `status`: `pending`, `in_progress`, `done`, `pendente`, `em_andamento` ou `concluida`.
- `type`: `tarefa`, `prova`, `consulta`, `evento` ou `lembrete`.
- `external_id`: idempotencia para a automacao externa. Reenvios com o mesmo `source + external_id` nao duplicam.
- `source`: origem da automacao. Padrao: `codex`.
- `source_label`: rotulo humano da origem, como `Print WhatsApp 2026-05-18`.
- `source_reference`: referencia curta para depuracao, como texto interpretado ou identificador externo.
- `recurrence_rule`: reservado para recorrencia futura. Hoje e armazenado, mas nao expande repeticoes.
- `reminder_enabled`, `reminder_value`, `reminder_unit`: ativa lembrete interno do CasaSync.

Limite: no maximo 50 itens por requisicao.

## Criacao Em Lote

```json
[
  {
    "title": "Prova de Circuitos",
    "description": "Levar calculadora e revisar lista 3",
    "date": "2026-05-22",
    "time": "19:00",
    "timezone": "America/Sao_Paulo",
    "responsible": "Kauan",
    "category": "Faculdade",
    "priority": "high",
    "status": "pending",
    "type": "prova",
    "external_id": "codex-2026-05-18-prova-circuitos",
    "source": "codex",
    "source_label": "Lista interpretada pelo Codex",
    "source_reference": "Cadastrar prova de Circuitos dia 22/05 as 19h",
    "reminder_enabled": true,
    "reminder_value": 1,
    "reminder_unit": "days"
  },
  {
    "title": "Consulta da Bia",
    "description": "Levar exames",
    "date": "2026-05-18",
    "time": "08:40",
    "responsible": "Bia",
    "category": "Saude",
    "priority": "medium",
    "type": "consulta",
    "external_id": "codex-2026-05-18-consulta-bia",
    "source_reference": "Consulta da Bia dia 18/05 as 08h40"
  }
]
```

Resposta resumida:

```json
{
  "request_id": "9f5d4f2d2f1a4b9f9e9d2c78d7d34c01",
  "total_received": 2,
  "total_created": 2,
  "total_skipped": 0,
  "total_failed": 0,
  "created_tasks": [],
  "skipped_duplicates": [],
  "results": [
    {
      "index": 0,
      "action": "created",
      "task_id": "task-id",
      "external_id": "codex-2026-05-18-prova-circuitos",
      "title": "Prova de Circuitos",
      "message": "Item criado no CasaSync."
    }
  ]
}
```

`created_tasks` e `results[].task` retornam o formato completo de tarefa do CasaSync quando aplicavel.

## Edicao

```json
PATCH /api/automation/tasks/task-id
```

```json
{
  "description": "Levar exames e documento",
  "priority": "alta",
  "category": "Saude",
  "source_reference": "Usuario pediu: adicionar descricao levar exames"
}
```

## Remarcacao

```json
POST /api/automation/tasks/task-id/reschedule
```

```json
{
  "date": "2026-05-23",
  "time": "20:00",
  "timezone": "America/Sao_Paulo",
  "source_reference": "Remarcado por mensagem recebida pelo Codex"
}
```

## Cancelamento

```text
POST /api/automation/tasks/task-id/cancel
```

Hoje o cancelamento remove o item do CasaSync usando a mesma regra segura de exclusao de tarefas. Um status historico de cancelado pode ser adicionado futuramente se a UI tambem passar a exibir esse estado.

## Duplicatas E Idempotencia

A API evita duplicatas de duas formas:

- Se `external_id` for enviado, `source + external_id` identifica o item de forma estavel.
- Sem `external_id`, a API compara familia, responsavel, titulo, tipo e minuto exato do horario.

Duplicatas dentro da mesma requisicao tambem sao puladas e aparecem em `results` com `action: "skipped_duplicate"`.

## Erros Por Item

Erros de negocio, como responsavel inexistente ou categoria fora da familia, aparecem por item em `results` com `action: "failed"`. Assim, um lote pode criar os itens validos e apontar exatamente quais entradas precisam de correcao.

Erros estruturais de JSON, data invalida ou campos com tipo errado continuam retornando `422` do FastAPI antes da execucao do lote.

## Logs

A camada registra eventos com `request_id`:

- `automation_batch_started`
- `automation_item_created`
- `automation_item_failed`
- `automation_item_duplicate_conflict`
- `automation_batch_finished`
- `automation_task_updated`
- `automation_task_rescheduled`
- `automation_task_cancelled`

Use o `request_id` da resposta para procurar o lote correspondente nos logs da API.

## Como O Codex Deve Usar

1. Interpretar print, texto ou lista fora do CasaSync.
2. Normalizar cada compromisso para `title`, `date`, `time`, `responsible`, `category`, `priority` e `type`.
3. Criar um `external_id` estavel para cada item interpretado.
4. Enviar `POST /api/automation/tasks`.
5. Ler `results` e reportar criados, duplicados e falhas.
6. Se o usuario pedir alteracao depois, usar `PATCH`, `reschedule` ou `cancel` com o `task_id` retornado.

## Teste Manual

1. Fazer login pela API normal e copiar o `access_token`.
2. Conferir membros em `GET /api/families/members`.
3. Conferir categorias em `GET /api/categories`.
4. Enviar o lote para `POST /api/automation/tasks`.
5. Confirmar em `GET /api/tasks` ou pela tela de tarefas/calendario.

Exemplo com curl:

```bash
curl -X POST "http://localhost:8000/api/automation/tasks" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '[{"title":"Prova de Circuitos","description":"Levar calculadora","date":"2026-05-22","time":"19:00","responsible":"Kauan","category":"Faculdade","priority":"high","type":"prova","external_id":"codex-2026-05-18-prova-circuitos"}]'
```

## Preparado Para Futuro

A estrutura ja tem espaco para:

- recorrencia futura via `recurrence_rule`;
- plugins/extensoes usando `source`;
- idempotencia por `external_id`;
- depuracao por `request_id` e `source_reference`;
- OCR/IA fora do CasaSync, com o CasaSync recebendo apenas dados estruturados.

## Limitacoes Atuais

- `recurrence_rule` e apenas armazenado; ainda nao cria repeticoes.
- Cancelamento remove o item em vez de manter historico visual de cancelado.
- A API nao cria categorias automaticamente; o Codex deve usar uma categoria existente ou pedir confirmacao.
- A API nao interpreta imagens, nao chama IA e nao conversa com Google Agenda.
