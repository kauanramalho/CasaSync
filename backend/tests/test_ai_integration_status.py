import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user
from app.database.session import get_db
from app.routes.image_analysis import router
from app.schemas.image_analysis import ImageAnalysisResponse, ImageAnalysisUsage
from app.services.image_analysis_service import parse_validated_images_to_task_suggestions
from app.services.image_service import ValidatedImageUpload
from tests.test_ai_vision_adapter import response_payload, valid_item


class AiStatusTest(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api")
        self.settings = Settings(_env_file=None, openai_api_key="synthetic-test-only", ai_vision_enabled=True)
        self.app.dependency_overrides[get_settings] = lambda: self.settings
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="test-user")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()

    def test_status_exposes_configuration_not_credentials_or_delivery_guarantees(self):
        response = self.client.get("/api/image-analysis/status")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {"enabled", "configured", "provider", "model", "reasoningEffort", "message"})
        self.assertTrue(body["enabled"])
        self.assertTrue(body["configured"])
        self.assertEqual(body["model"], "gpt-6-luna")
        self.assertEqual(body["reasoningEffort"], "medium")
        self.assertNotIn("synthetic-test-only", response.text)

    def test_disabled_and_missing_credentials_are_distinct_fail_closed_states(self):
        self.settings = Settings(_env_file=None, ai_vision_enabled=False, openai_api_key="synthetic-test-only")
        self.assertFalse(self.client.get("/api/image-analysis/status").json()["enabled"])
        self.settings = Settings(_env_file=None, ai_vision_enabled=True, openai_api_key=None)
        self.assertFalse(self.client.get("/api/image-analysis/status").json()["configured"])

    def test_status_requires_authentication(self):
        self.app.dependency_overrides.pop(get_current_user)
        def empty_db():
            yield None
        self.app.dependency_overrides[get_db] = empty_db
        self.assertEqual(self.client.get("/api/image-analysis/status").status_code, 401)


class AiBatchTelemetryTest(unittest.TestCase):
    def test_batch_keeps_max_attempt_count_unique_reasons_and_summed_usage(self):
        first = ImageAnalysisResponse.model_validate(response_payload(valid_item()))
        first.attemptCount = 1
        first.usage = ImageAnalysisUsage(inputTokens=10, outputTokens=20, totalTokens=30)
        second = first.model_copy(deep=True)
        second.attemptCount = 2
        second.retryReasons = ["low_confidence"]
        adapter = Mock()
        adapter.parse_image_to_task_suggestions.side_effect = [first, second]
        images = [ValidatedImageUpload(f"test-{n}.png", "image/png", 8, b"synthetic") for n in range(2)]
        with patch("app.services.image_analysis_service.get_ai_vision_adapter", return_value=adapter):
            result = parse_validated_images_to_task_suggestions(images=images, family_id="test-family", settings=Settings(_env_file=None))
        self.assertEqual(result.attemptCount, 2)
        self.assertEqual(result.retryReasons, ["low_confidence"])
        self.assertEqual(result.usage.totalTokens, 60)
        self.assertEqual(result.totalImagesProcessed, 2)
        self.assertTrue(result.needsUserReview)
