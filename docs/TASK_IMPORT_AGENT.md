# Agente Criador de Tarefas

Esta etapa transforma sugestoes revisadas em tarefas reais do CasaSync.

## Fluxo seguro

- O usuario envia imagem e recebe sugestoes estruturadas.
- O frontend exibe as sugestoes para revisao, edicao, remocao e confirmacao.
- O utilitario `frontend/src/utils/taskSuggestionReview.js` separa dado bruto da IA, sugestao editavel e payload validado.
- A criacao real so acontece quando o usuario clica no botao de criar tarefas selecionadas.
- O frontend envia `POST /api/tasks/import-suggestions` sem `familyId`.
- O backend resolve usuario autenticado e familia ativa.
- O service `backend/app/services/task_import_service.py` valida e normaliza cada item.
- Cada item valido passa por `backend/app/services/task_service.py:create_task`.

## Validacoes no backend

- Autenticacao obrigatoria.
- Familia ativa obrigatoria.
- Membro precisa pertencer a familia ativa.
- Responsaveis informados precisam pertencer a familia.
- Categoria por `categoryId` precisa pertencer a familia.
- Titulo minimo e datas/horarios validos.
- Itens de baixa confianca exigem confirmacao explicita.
- Duplicatas obvias por titulo e data sao bloqueadas.
- O payload nao aceita `familyId`.

## Validacoes no frontend

- Titulo obrigatorio antes de enviar.
- Itens de baixa confianca precisam de confirmacao de revisao.
- Campos incertos de data, horario, categoria e responsavel aparecem como avisos editaveis.
- O usuario pode ignorar, remover ou cancelar sugestoes sem side effects.

## Limites atuais

`create_task` faz commit por item, entao a importacao retorna relatorio item a item. Se um item falha, os itens validos anteriores permanecem criados e o relatorio indica o que ficou pendente.
