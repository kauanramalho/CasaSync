import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.image_analysis import ImageAnalysisItem
from app.services.ai_task_suggestion_post_processor import (
    AiCategoryOption,
    AiMemberOption,
    AiSuggestionContext,
    detect_explicit_assignee_ids,
    normalize_suggestion_date,
    resolve_assignee_ids_for_suggestion,
    resolve_category_id_for_suggestion,
)
from app.services.reminder_rules import normalize_reminder_entries


def make_item(**overrides):
    data = {
        "type": "task",
        "title": "Cinema no shopping",
        "description": "Sessao de cinema no Boulevard",
        "date": None,
        "time": None,
        "endDate": None,
        "endTime": None,
        "category": None,
        "priority": "medium",
        "responsible": None,
        "confidence": 0.9,
        "warnings": [],
        "reminderEnabled": False,
        "reminderValue": None,
        "reminderUnit": None,
        "reminders": [],
        "sourceImageName": "agenda.png",
        "originalText": None,
        "needsReview": True,
        "googleCalendarSuggestion": False,
    }
    data.update(overrides)
    return ImageAnalysisItem.model_validate(data)


class AiTaskSuggestionPostProcessorTest(unittest.TestCase):
    def setUp(self):
        self.members = (
            AiMemberOption(id="user-kauan", name="Kauan"),
            AiMemberOption(id="user-bia", name="Bia"),
        )
        self.categories = (
            AiCategoryOption(id="cat-casa", name="Casa", icon="home", is_default=True),
            AiCategoryOption(id="cat-rel", name="Relacionamento", icon="heart", is_default=True),
            AiCategoryOption(id="cat-facul", name="Faculdade", icon="book-open", is_default=True),
        )
        self.context = AiSuggestionContext(
            members=self.members,
            categories=self.categories,
            now=datetime(2026, 5, 22, 12, 0, tzinfo=timezone(timedelta(hours=-3))),
        )

    def test_responsavel_kauan_selects_only_kauan(self):
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Kauan", self.members), ["user-kauan"])

    def test_responsavel_bia_selects_only_bia(self):
        self.assertEqual(detect_explicit_assignee_ids("responsavel: bia", self.members), ["user-bia"])

    def test_responsavel_kauan_e_bia_selects_both(self):
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Kauan e Bia", self.members), ["user-kauan", "user-bia"])

    def test_ai_nonexistent_responsible_is_ignored(self):
        item = make_item(responsible="Pessoa inexistente")
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, self.context)
        self.assertEqual(assignee_ids, [])
        self.assertTrue(warnings)

    def test_category_result_always_belongs_to_existing_categories(self):
        item = make_item(category="Categoria inventada")
        category_id, _ = resolve_category_id_for_suggestion(item, self.context)
        self.assertIn(category_id, {category.id for category in self.categories})

    def test_cinema_maps_to_relationship_category(self):
        item = make_item(title="Sessao de cinema", description="Filme no shopping boulevard", category="Aleatoria")
        category_id, _ = resolve_category_id_for_suggestion(item, self.context)
        self.assertEqual(category_id, "cat-rel")

    def test_day_month_time_without_year_uses_current_year(self):
        item = make_item(originalText="Prova 23/05 16:30")
        date_value, time_value, _ = normalize_suggestion_date(item, self.context)
        self.assertEqual(date_value, "2026-05-23")
        self.assertEqual(time_value, "16:30")

    def test_old_ai_year_is_corrected_to_current_or_next_year(self):
        item = make_item(date="2020-05-23", time="16:30", originalText="23/05 16:30")
        date_value, _, _ = normalize_suggestion_date(item, self.context)
        self.assertEqual(date_value, "2026-05-23")

        future_context = AiSuggestionContext(
            members=self.members,
            categories=self.categories,
            now=datetime(2026, 5, 24, 12, 0, tzinfo=timezone(timedelta(hours=-3))),
        )
        next_year_date, _, _ = normalize_suggestion_date(item, future_context)
        self.assertEqual(next_year_date, "2027-05-23")

    def test_invalid_144_hours_reminder_is_discarded(self):
        reminders, invalid_count, _ = normalize_reminder_entries([{"value": 144, "unit": "hours"}])
        self.assertEqual(reminders, [])
        self.assertEqual(invalid_count, 1)

    def test_past_reminder_does_not_block_valid_reminders(self):
        now = datetime.now(timezone(timedelta(hours=-3)))
        due_date = now + timedelta(hours=1)
        reminders, invalid_count, past_count = normalize_reminder_entries(
            [{"value": 1, "unit": "days"}, {"value": 15, "unit": "minutes"}],
            due_date=due_date,
            now=now,
            discard_past=True,
        )
        self.assertEqual(invalid_count, 0)
        self.assertEqual(past_count, 1)
        self.assertEqual(reminders, [(15, "minutes")])


if __name__ == "__main__":
    unittest.main()
