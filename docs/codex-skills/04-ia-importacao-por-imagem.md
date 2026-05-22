# IA e Importacao por Imagem

Use este guia antes de alterar upload de imagem, OpenAI Vision, sugestoes da IA, revisao humana, criacao automatica ou importacao em lote.

## Fluxo atual

- Entrada visual: `frontend/src/components/ImageTaskImportPanel.jsx`, exibido em `frontend/src/pages/NewTask.jsx`.
- O usuario seleciona uma ou varias imagens. O frontend valida tipo, tamanho/dimensoes, evita duplicadas no lote e otimiza antes de enviar.
- Cliente API: `imageAnalysisApi.analyzeTaskSuggestions` em `frontend/src/services/api.js`.
- Endpoint: `POST /api/image-analysis/task-suggestions`.
- Backend: `backend/app/routes/image_analysis.py` valida autenticacao, familia ativa e feature flag de imagem.
- Service: `backend/app/services/image_analysis_service.py`.
- Validacao de arquivo: `backend/app/services/image_service.py`.
- Adapter de IA: `backend/app/services/ai_vision_adapter.py`.
- Schema de resposta: `backend/app/schemas/image_analysis.py`.
- Criacao real de tarefas: `POST /api/tasks/import-suggestions`, `backend/app/services/task_import_service.py`.

## OpenAI Vision

- A chamada a OpenAI deve acontecer somente no backend.
- Variaveis relevantes ficam em `backend/app/core/config.py`: `AI_IMAGE_ANALYSIS_ENABLED`, `AI_VISION_ENABLED`, `AI_VISION_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, timeout e max tokens.
- O frontend nunca deve receber `OPENAI_API_KEY`, prompt interno, resposta crua do provider ou conteudo bruto da imagem em logs.
- Quando IA estiver desativada ou mal configurada, o fluxo deve falhar com mensagem segura. Nao reintroduzir respostas falsas se o requisito for IA real.

## Multiplas imagens e sugestoes

- Limite atual de analise: 10 imagens por envio em `MAX_IMAGE_ANALYSIS_FILES`.
- Limite atual de sugestoes revisaveis: 20 itens em `MAX_IMAGE_ANALYSIS_ITEMS`.
- O frontend envia `file` para imagem unica e `files` para lote.
- O backend processa por imagem, registra `imageErrors` por arquivo e nao derruba o lote inteiro quando uma imagem falha.
- A IA pode gerar zero, uma ou varias sugestoes por imagem; nao force uma tarefa por imagem.
- Use `sourceImageName` e `originalText` para contexto revisavel, mas sem salvar imagem permanente nesse fluxo.

## Schema de sugestao

Campos principais em `ImageAnalysisItem`:

- `type`: `task`, `event` ou `reminder`.
- `title`, `description`.
- `date`, `time`, `endDate`, `endTime`.
- `category`, `priority`, `responsible`.
- `confidence` de 0 a 1.
- `warnings`, `needsReview`.
- `reminderEnabled`, `reminderValue`, `reminderUnit`.
- `sourceImageName`, `originalText`.
- `googleCalendarSuggestion`.

A resposta completa traz `sourceType`, `overallConfidence`, `items`, `warnings`, `needsUserReview`, `imageErrors`, `totalImagesProcessed` e `totalSuggestionsGenerated`.

## Revisao, importacao e criacao automatica

- Dados brutos da IA viram itens editaveis via `frontend/src/utils/taskSuggestionReview.js`.
- O usuario pode editar, selecionar/desmarcar, remover, ajustar data/hora, categoria, prioridade, responsaveis, lembrete e Google Agenda.
- Criacao manual chama `tasksApi.importSuggestions`.
- Modo automatico envia `autoCreate=true`, mas o backend so cria itens seguros: titulo valido, confianca alta, sem warnings, categoria/responsavel validados, sem data/horario invalido e sem duplicidade obvia.
- Itens inseguros voltam em `pendingReview`.
- Mesmo em modo automatico, a opcao precisa ter sido ativada pelo usuario; nao criar ao simples upload.

## Instrucoes personalizadas

- UI dentro de `ImageTaskImportPanel`.
- Endpoints: `GET/PUT/DELETE /api/image-analysis/preferences`.
- Persistencia atual: `users.ai_task_import_instructions`.
- Limite atual: 1500 caracteres.
- `normalize_ai_task_import_instructions` remove controles e bloqueia padroes obvios de segredos.
- As instrucoes sao preferencias secundarias. Elas nao podem sobrescrever regras de seguranca, familia, permissao ou validacao backend.

## Riscos conhecidos

- Timeout da OpenAI ou imagem grande pode causar demora perceptivel.
- Fotos inclinadas, baixa luz, prints comprimidos e textos pequenos geram baixa confianca.
- IA pode sugerir nomes de responsaveis/categorias que nao existem; o backend deve validar contra a familia atual.
- Datas podem vir ambiguas; warnings devem ser preservados.
- O sistema suporta um lembrete por tarefa nesta etapa.
- Duplicidade e apenas defensiva/basica; nao trate como garantia perfeita.
- Google Agenda exige data e horario confirmados para sync segura.

## Checklist antes de mexer

- Ler `docs/codex-skills/ai-task-import.md` se a mudanca for especificamente na UI avancada de importacao.
- Conferir `ImageTaskImportPanel`, `taskSuggestionReview`, `image_analysis_service`, `ai_vision_adapter`, `task_import_service` e schemas.
- Nao logar imagem, OCR, prompt completo, API key ou provider payload.
- Manter revisao humana quando modo automatico estiver desligado e manter pendencias editaveis quando automatico bloquear itens.
