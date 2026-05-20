---
name: casasync-vision-extraction-schema
description: "Use this skill whenever a CasaSync task involves interpreting an image with AI, OCR, screenshots, calendar photos, documents, proofs, or visual extraction into structured data. The goal is to transform the image into reviewable JSON containing tasks, dates, times, categories, priorities, descriptions, recurrence, source evidence, and confidence. Never create or persist tasks automatically during this step. Always return data for human review."
---

# CasaSync Vision Extraction Schema

## Purpose

Convert visual input into structured, reviewable CasaSync task suggestions. This skill produces data only; it does not save tasks.

## Output Contract

Return JSON that is easy for a review UI and backend validation service to consume:

```json
{
  "source": {
    "kind": "image",
    "language": "pt-BR",
    "summary": "short human-readable summary",
    "confidence": 0.0
  },
  "suggestions": [
    {
      "type": "task",
      "title": "string",
      "description": "string or null",
      "category": "string or null",
      "priority": "low | medium | high | null",
      "due_date": "YYYY-MM-DD or null",
      "due_time": "HH:mm or null",
      "timezone": "America/Sao_Paulo or null",
      "recurrence": {
        "frequency": "none | daily | weekly | monthly | custom | unknown",
        "details": "string or null"
      },
      "assignee_hint": "string or null",
      "evidence": "short non-sensitive excerpt or location hint",
      "confidence": 0.0,
      "needs_review": true,
      "warnings": ["string"]
    }
  ],
  "ambiguities": ["string"],
  "rejected_items": [
    {
      "reason": "string",
      "evidence": "string"
    }
  ]
}
```

## Extraction Rules

- Keep dates and times explicit; never invent a date, time, assignee, category, or recurrence.
- Use `null` and a warning when the image is ambiguous.
- Mark every suggestion with `needs_review: true`.
- Prefer `America/Sao_Paulo` only when the user context or product default justifies it; otherwise use `null`.
- Preserve uncertainty with confidence scores rather than pretending extraction is certain.
- Do not include raw OCR dumps, sensitive personal content, image bytes, or full document text in the response.
- Do not call task creation APIs from this stage.

## Validation Before Review

- Validate that the JSON shape is parseable.
- Normalize priority to CasaSync values.
- Normalize date/time formats when present.
- Keep category as a hint until matched against existing family categories.
- Flag duplicate-looking suggestions, missing titles, impossible dates, and contradictory text.

## Handoff

Send the structured JSON to a human review flow. Saving is handled only after explicit confirmation by the user.
