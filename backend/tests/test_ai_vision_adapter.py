import json
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from fastapi import HTTPException

from app.services.ai_vision_adapter import OPENAI_RESPONSES_URL, OpenAIVisionAdapter, VisionAnalysisContext
from app.services.image_service import ValidatedImageUpload


def valid_item(**overrides):
    item = {
        "type": "event",
        "title": "Ensaio do ministerio",
        "description": "Louvores: Bondade de Deus",
        "date": "2026-08-15",
        "time": "19:30",
        "endDate": None,
        "endTime": None,
        "dateYearSource": "explicit",
        "category": None,
        "categoryId": None,
        "priority": "medium",
        "responsible": None,
        "assigneeId": None,
        "assigneeIds": [],
        "responsibleAliasMatched": None,
        "roleDetected": "Bateria",
        "location": "Igreja",
        "confidence": 0.96,
        "warnings": [],
        "reminderEnabled": False,
        "reminderValue": None,
        "reminderUnit": None,
        "reminders": [],
        "sourceImageName": "escala.png",
        "originalText": "15/08 Cauã Bateria",
        "needsReview": True,
        "needsConfirmation": False,
        "sourceEvidence": {
            "dateText": "15/08",
            "personText": "Cauã",
            "roleText": "Bateria",
            "descriptionTexts": ["Bondade de Deus"],
            "blockText": "15/08 | Cauã | Bateria",
            "locationText": "Igreja",
        },
        "googleCalendarSuggestion": True,
    }
    item.update(overrides)
    return item


def response_payload(*items, overall_confidence=0.96):
    return {
        "sourceType": "image",
        "overallConfidence": overall_confidence,
        "items": list(items),
        "warnings": [],
        "needsUserReview": True,
        "imageErrors": [],
        "totalImagesProcessed": 1,
        "totalSuggestionsGenerated": len(items),
    }


class FakeResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class OpenAIVisionAdapterMockTest(unittest.TestCase):
    def setUp(self):
        self.adapter = OpenAIVisionAdapter()
        self.image = ValidatedImageUpload("escala.png", "image/png", 8, b"\x89PNG\r\n\x1a\n")
        self.context = VisionAnalysisContext(
            family_id="family-1",
            provider="openai",
            enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.6-luna",
            openai_vision_reasoning_effort="medium",
            openai_vision_retry_reasoning_effort="high",
            openai_vision_max_attempts=2,
            openai_vision_auto_confirm_threshold=0.90,
            members=[{"id": "user-kauan", "name": "Kauan Ramalho", "aliases": ["Cauã"]}],
            timezone_name="America/Sao_Paulo",
            current_datetime="2026-08-05T12:00:00-03:00",
        )

    def test_valid_response_uses_responses_medium_once(self):
        fake = Mock(return_value=FakeResponse({"output_text": json.dumps(response_payload(valid_item())), "usage": {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30}}))
        with patch("app.services.ai_vision_adapter.urlopen", fake):
            result = self.adapter.parse_image_to_task_suggestions(self.image, self.context)

        self.assertEqual(result.attemptCount, 1)
        self.assertEqual(fake.call_count, 1)
        request = fake.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, OPENAI_RESPONSES_URL)
        self.assertEqual(payload["model"], "gpt-5.6-luna")
        self.assertEqual(payload["reasoning"], {"effort": "medium"})
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertEqual(payload["input"][1]["content"][1]["type"], "input_image")
        self.assertEqual(result.usage.totalTokens, 30)

    def test_invalid_first_response_retries_once_in_high(self):
        fake = Mock(side_effect=[FakeResponse({"output_text": "not-json"}), FakeResponse({"output_text": json.dumps(response_payload(valid_item()))})])
        with patch("app.services.ai_vision_adapter.urlopen", fake):
            result = self.adapter.parse_image_to_task_suggestions(self.image, self.context)

        self.assertEqual(result.attemptCount, 2)
        self.assertEqual(fake.call_count, 2)
        first = json.loads(fake.call_args_list[0].args[0].data.decode("utf-8"))
        second = json.loads(fake.call_args_list[1].args[0].data.decode("utf-8"))
        self.assertEqual(first["reasoning"]["effort"], "medium")
        self.assertEqual(second["reasoning"]["effort"], "high")
        self.assertIn("schema_invalid", result.retryReasons)

    def test_ambiguous_response_retries_and_stays_pending_after_second(self):
        ambiguous = valid_item(responsible="Cauã", assigneeIds=[], assigneeId=None, needsConfirmation=True, confidence=0.94)
        fake = Mock(side_effect=[FakeResponse({"output_text": json.dumps(response_payload(ambiguous))}), FakeResponse({"output_text": json.dumps(response_payload(ambiguous))})])
        with patch("app.services.ai_vision_adapter.urlopen", fake):
            result = self.adapter.parse_image_to_task_suggestions(self.image, self.context)

        self.assertEqual(fake.call_count, 2)
        self.assertTrue(result.items[0].needsConfirmation)
        self.assertIn("ambiguous_assignee", result.retryReasons)

    def test_429_does_not_loop(self):
        error = HTTPError(OPENAI_RESPONSES_URL, 429, "rate", {}, None)
        fake = Mock(side_effect=error)
        with patch("app.services.ai_vision_adapter.urlopen", fake):
            with self.assertRaises(HTTPException) as raised:
                self.adapter.parse_image_to_task_suggestions(self.image, self.context)

        self.assertEqual(fake.call_count, 1)
        self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
