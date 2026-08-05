import unittest

from pydantic import ValidationError

from app.core.config import Settings


class AiVisionConfigTest(unittest.TestCase):
    def test_defaults_target_luna_medium_with_single_high_retry(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.openai_vision_model, "gpt-5.6-luna")
        self.assertEqual(settings.openai_vision_reasoning_effort, "medium")
        self.assertEqual(settings.openai_vision_retry_reasoning_effort, "high")
        self.assertEqual(settings.openai_vision_max_attempts, 2)

    def test_invalid_reasoning_or_attempt_limit_fails_safe(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, openai_vision_reasoning_effort="invalid")
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, openai_vision_max_attempts=3)


if __name__ == "__main__":
    unittest.main()
