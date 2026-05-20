# Agente Leitor de Imagem

Esta base permite receber uma imagem do usuario, validar o arquivo e retornar sugestoes estruturadas de tarefas/eventos sem criar nada no banco.

## Fluxo atual

- Frontend envia `multipart/form-data` para `POST /api/image-analysis/task-suggestions`.
- Backend valida autenticacao e familia ativa com `get_family_id`.
- Backend valida tipo, extensao, assinatura real do arquivo e tamanho em `backend/app/services/image_service.py`.
- `backend/app/services/image_analysis_service.py` chama o adapter de visao.
- `backend/app/services/ai_vision_adapter.py` seleciona mock ou OpenAI Vision e sempre retorna o schema de revisao.
- Nenhuma tarefa, evento, imagem persistente ou dado de calendario e criado.

## OpenAI Vision

O provider real fica em `backend/app/services/ai_vision_adapter.py`.

Variaveis:

- `AI_VISION_PROVIDER=openai`
- `AI_VISION_ENABLED=true`
- `OPENAI_API_KEY=<definida apenas no ambiente seguro>`
- `OPENAI_VISION_MODEL=gpt-4.1-mini`
- `OPENAI_VISION_TIMEOUT_SECONDS=20`
- `OPENAI_VISION_MAX_OUTPUT_TOKENS=1200`

Se `AI_VISION_ENABLED=false`, `AI_VISION_PROVIDER=mock` ou `OPENAI_API_KEY` estiver ausente, o CasaSync usa mock seguro. A chave nunca deve ir para o frontend.

O adapter real:

- chama a OpenAI somente no backend;
- envia a imagem validada como data URL temporaria;
- usa JSON Schema para pedir retorno estruturado;
- valida o retorno com `ImageAnalysisResponse`;
- retorna warnings seguros se a imagem estiver ruim, a API falhar ou a resposta vier fora do schema;
- mantem `needsUserReview=true`;
- nao cria tarefas automaticamente.

## Feature flag

`AI_IMAGE_ANALYSIS_ENABLED=false` desativa o endpoint sem remover a UI nem quebrar o app.

`AI_VISION_ENABLED=false` mantem o endpoint ativo com mock seguro.
