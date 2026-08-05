# Avaliacao local de visao

O repositorio inclui `backend/tests/vision_eval_cases.json` e `backend/tools/evaluate_vision_mocks.py` para comparar Luna Medium e Luna High sem chamadas de rede. As imagens nao ficam no Git: coloque fixtures privadas em `backend/tests/private/` apenas na maquina de avaliacao.

```powershell
backend\.venv\Scripts\python.exe backend\tools\evaluate_vision_mocks.py --effort medium
backend\.venv\Scripts\python.exe backend\tools\evaluate_vision_mocks.py --effort high
```

O resultado sem `--responses` somente confirma a infraestrutura e deixa metricas como `null`. Para uma rodada mockada, passe um JSON local com uma entrada por fixture e os campos `schema_valid`, `needs_confirmation`, `member_accuracy`, `role_accuracy`, `date_accuracy`, `input_tokens`, `output_tokens`, `reasoning_tokens`, `latency_ms` e `estimated_cost_usd`. Nao declare que High e melhor sem resultados medidos. A avaliacao nao aceita `OPENAI_API_KEY` nem habilita chamadas externas.
