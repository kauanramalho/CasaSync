# Tarefas, Anexos e Detalhes

Use este guia antes de alterar criacao, edicao, listagem, anexos ou visualizacao de detalhes de tarefas.

## Onde fica o fluxo de tarefas

- Criacao manual: `frontend/src/pages/NewTask.jsx`.
- Listagem principal: `frontend/src/pages/Tasks.jsx`.
- Dashboard: `frontend/src/pages/Dashboard.jsx`, mostrando tarefas recentes pendentes por meio de `TaskList`.
- Edicao: `frontend/src/components/TaskEditorModal.jsx`.
- Tabela/lista: `frontend/src/components/TaskList.jsx`.
- API frontend: `tasksApi` em `frontend/src/services/api.js`.
- Rotas backend: `backend/app/routes/tasks.py`.
- Regra de negocio: `backend/app/services/task_service.py`.
- Modelo: `backend/app/models/task.py`.
- Contratos: `backend/app/schemas/task.py` e, para importacao IA, `backend/app/schemas/task_import.py`.

## Campos importantes de tarefa

- Texto: `title`, `description`.
- Familia e autoria: `family_id`, `creator_id`.
- Responsaveis: `assignee_id` legado e `assignee_links`/`assignee_ids` para multiplos responsaveis.
- Categoria: `category_id` e relacao `category`.
- Prazo: `due_date`.
- Prioridade: `baixa`, `media`, `alta` no frontend; backend tambem normaliza aliases vindos da IA.
- Status: `pendente`, `em_andamento`, `concluida`, `atrasada`.
- Tipo: `task_type`.
- Pontuacao: `points_awarded`, `score_recorded_at`, links de responsaveis e ranking.
- Lembretes: `reminder_enabled`, `reminder_value`, `reminder_unit`, `reminder_at`, `reminder_sent`.
- Google Agenda: `google_calendar_event_id`, `google_calendar_synced_at`, `google_calendar_synced_by_id`.
- Origem automatizada: `automation_source`, `automation_external_id`, `automation_source_label`, `automation_source_reference`, `recurrence_rule`.
- Anexos: relacao `attachments` com `TaskAttachment`.

## Criacao e edicao

- Criacao manual deve continuar chamando `tasksApi.create`, que chega em `create_task`.
- Edicao deve chamar `tasksApi.update`, depois aplicar mudancas de anexos com `applyTaskAttachmentChanges` quando necessario.
- `task_service.py` valida familia, responsaveis, categoria, lembrete e status. Nao duplique essas regras no frontend.
- Ao concluir/reabrir, use `tasksApi.complete`; o backend ajusta pontos, ranking, `completed_at` e lembretes.
- Para importacoes por IA, use `/tasks/import-suggestions` e `task_import_service.py`; nao crie tarefas direto no componente.

## Anexos

- UI: `TaskAttachmentField.jsx`.
- Utils: `frontend/src/utils/taskAttachments.js` e `frontend/src/utils/files.js`.
- Backend: endpoints em `routes/tasks.py`:
  - `POST /tasks/{task_id}/attachments`
  - `GET /tasks/{task_id}/attachments`
  - `GET /tasks/{task_id}/attachments/{attachment_id}/download`
  - `DELETE /tasks/{task_id}/attachments/{attachment_id}`
- Service: `task_attachment_service.py`.
- Tipos permitidos: PNG, JPG/JPEG, WEBP e PDF.
- Limite atual: 8 MB.
- O caminho fisico nunca deve ir para o frontend. Acesso sempre via endpoint autenticado e familia ativa.
- Storage local atual: `backend/storage/task_attachments/{family_id}/{task_id}/{stored_name}`.

## Como implementar visualizacao de detalhes sem depender do editar

- Crie um modo/tela/modal de leitura, por exemplo `TaskDetailsModal`, sem reutilizar o modal de edicao como unica forma de consultar dados.
- Busque detalhes com `tasksApi.retrieve(task.id)` quando precisar dos dados completos.
- Mostre titulo, descricao, status, categoria, prioridade, prazo, responsaveis, lembrete, anexos, origem IA/automacao e Google Agenda quando houver.
- Baixar/visualizar anexo deve continuar usando `tasksApi.downloadAttachment`.
- Acoes como editar, concluir, reabrir, excluir e remover anexo devem continuar passando pelos endpoints existentes.
- Se adicionar abertura por clique na linha, preserve menus, ordenacao e botoes existentes do `TaskList`.

## Cuidados

- Nao aceitar `familyId` sensivel vindo do frontend para criar/editar tarefa.
- Nao permitir responsavel fora da familia ativa.
- Nao deixar anexo sem tarefa persistida.
- Nao apagar arquivo fisico antes de sucesso claro na remocao de metadados.
- Nao mexer em pontuacao/ranking ao alterar apenas UI de detalhes.
- Manter tarefas antigas sem anexo, sem lembrete ou com `assignee_id` legado funcionando.
