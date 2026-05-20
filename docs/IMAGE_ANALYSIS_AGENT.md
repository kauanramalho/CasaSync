# Agente Leitor de Imagem

Esta base permite receber uma imagem do usuario, validar o arquivo e retornar sugestoes estruturadas de tarefas/eventos sem criar nada no banco.

## Fluxo atual

- Frontend envia `multipart/form-data` para `POST /api/image-analysis/task-suggestions`.
- Backend valida autenticacao e familia ativa com `get_family_id`.
- Backend valida tipo, extensao, assinatura real do arquivo e tamanho em `backend/app/services/image_service.py`.
- `backend/app/services/image_analysis_service.py` chama o adapter de visao.
- `backend/app/services/ai_vision_adapter.py` retorna uma resposta mock no schema de revisao.
- Nenhuma tarefa, evento, imagem persistente ou dado de calendario e criado.

## Onde conectar uma API real

Troque a implementacao em `backend/app/services/ai_vision_adapter.py`.

Adicione um adapter real que implemente `parse_image_to_task_suggestions(image, context)` e retorne `ImageAnalysisResponse`. O adapter deve:

- usar `AI_VISION_PROVIDER` para selecionar o provedor;
- buscar credenciais apenas por variaveis de ambiente seguras;
- nunca gravar imagem, prompt, OCR bruto ou resposta completa em logs;
- retornar apenas JSON revisavel;
- manter `needsUserReview=true`.

## Feature flag

`AI_IMAGE_ANALYSIS_ENABLED=false` desativa o endpoint sem remover a UI nem quebrar o app.
