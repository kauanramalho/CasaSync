"""Avalia respostas locais do importador visual sem chamadas de rede.

Por padrao o comando apenas valida a infraestrutura e lista os fixtures privados
esperados. Para medir Medium/High, forneca um JSON de respostas em
`--responses`, produzido por um mock local, nunca por uma chave real.
"""

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "tests" / "vision_eval_cases.json"


def load_cases() -> list[dict]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def summarize(cases: list[dict], responses: list[dict] | None, effort: str) -> dict:
    result = {
        "effort": effort,
        "cases": len(cases),
        "fixture_paths_are_private": all(str(case["fixture"]).startswith("private/") for case in cases),
        "schema_valid_rate": None,
        "confirmation_rate": None,
        "member_accuracy": None,
        "role_accuracy": None,
        "date_accuracy": None,
        "input_tokens": None,
        "output_tokens": None,
        "reasoning_tokens": None,
        "latency_ms": None,
        "estimated_cost_usd": None,
    }
    if not responses:
        return result
    valid = [response for response in responses if response.get("schema_valid")]
    result["schema_valid_rate"] = len(valid) / len(cases) if cases else 0.0
    result["confirmation_rate"] = sum(bool(response.get("needs_confirmation")) for response in responses) / len(responses)
    for metric in ("member_accuracy", "role_accuracy", "date_accuracy"):
        result[metric] = sum(bool(response.get(metric)) for response in responses) / len(responses)
    for metric in ("input_tokens", "output_tokens", "reasoning_tokens", "latency_ms", "estimated_cost_usd"):
        values = [response.get(metric) for response in responses if response.get(metric) is not None]
        result[metric] = sum(values) if metric.endswith("tokens") else (sum(values) / len(values) if values else None)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--effort", choices=["medium", "high"], default="medium")
    parser.add_argument("--responses", type=Path, help="JSON local com uma resposta agregada por fixture")
    args = parser.parse_args()
    cases = load_cases()
    responses = json.loads(args.responses.read_text(encoding="utf-8")) if args.responses else None
    print(json.dumps(summarize(cases, responses, args.effort), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
