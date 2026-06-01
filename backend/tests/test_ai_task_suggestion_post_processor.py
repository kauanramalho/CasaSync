import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.image_analysis import ImageAnalysisItem, ImageAnalysisResponse
from app.services.ai_task_suggestion_post_processor import (
    AiCategoryOption,
    AiMemberOption,
    AiSuggestionContext,
    detect_explicit_assignee_ids,
    normalize_suggestion_date,
    post_process_image_analysis_response,
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
            AiMemberOption(id="user-kauan", name="Kauan Ramalho", username="kauan"),
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

    def test_responsavel_kuan_fuzzy_selects_kauan_when_clear(self):
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Kuan", self.members), ["user-kauan"])

    def test_responsavel_linguagem_natural_selects_only_kauan(self):
        text = "Essa imagem e um calendario de provas. O responsavel sera Kauan. Crie uma tarefa por prova."
        self.assertEqual(detect_explicit_assignee_ids(text, self.members), ["user-kauan"])

    def test_responsavel_bia_selects_only_bia(self):
        self.assertEqual(detect_explicit_assignee_ids("responsavel: bia", self.members), ["user-bia"])

    def test_responsavel_sem_acento_bia_selects_only_bia(self):
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Bia", self.members), ["user-bia"])

    def test_responsavel_kauan_e_bia_selects_both(self):
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Kauan e Bia", self.members), ["user-kauan", "user-bia"])

    def test_original_text_responsavel_bia_resolves_for_review_card(self):
        item = make_item(
            responsible="Bia",
            originalText="Consulta de Rotina Data: 26/05/2026 Hora: 15:30 Responsavel: Bia",
        )
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, self.context)
        self.assertEqual(assignee_ids, ["user-bia"])
        self.assertFalse(warnings)

    def test_original_suggestion_text_bia_resolves_for_review_card(self):
        item = make_item(responsible="Sugestao original: Bia")
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, self.context)
        self.assertEqual(assignee_ids, ["user-bia"])
        self.assertFalse(warnings)

    def test_original_suggestion_text_kuan_resolves_for_review_card(self):
        item = make_item(responsible="Sugestao original: Kuan")
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, self.context)
        self.assertEqual(assignee_ids, ["user-kauan"])
        self.assertFalse(warnings)

    def test_post_process_returns_assignee_resolution_contract(self):
        item = make_item(
            responsible="Kuan",
            originalText="Academia Data: 05/06/2026 Hora: 07:00 Local: Smart Fit Centro Responsavel: Kuan",
        )
        response = ImageAnalysisResponse(overallConfidence=0.9, items=[item], needsUserReview=True)
        processed = post_process_image_analysis_response(response, self.context)
        processed_item = processed.items[0]
        self.assertEqual(processed_item.assigneeIds, ["user-kauan"])
        self.assertEqual(processed_item.assigneeId, "user-kauan")
        self.assertEqual(processed_item.assigneeNames, ["Kauan Ramalho"])
        self.assertEqual(processed_item.resolvedAssigneeNames, ["Kauan Ramalho"])
        self.assertEqual(processed_item.assigneeResolutionStatus, "resolved")
        self.assertEqual(processed_item.assigneeResolutionWarnings, [])

    def test_user_context_overrides_ai_assignee_ids(self):
        context = AiSuggestionContext(members=self.members, categories=self.categories, image_context="Cinema. Responsavel: Kauan")
        item = make_item(responsible="Bia", assigneeIds=["user-bia"])
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, context)
        self.assertEqual(assignee_ids, ["user-kauan"])
        self.assertFalse(warnings)

    def test_generic_members_resolve_first_names_and_lists(self):
        members = (
            AiMemberOption(id="user-joao", name="Joao Silva"),
            AiMemberOption(id="user-maria", name="Maria Souza"),
            AiMemberOption(id="user-ana", name="Ana Oliveira"),
            AiMemberOption(id="user-pedro", name="Pedro Santos"),
            AiMemberOption(id="user-lucas", name="Lucas Lima"),
        )
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Joao", members), ["user-joao"])
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Maria", members), ["user-maria"])
        self.assertEqual(detect_explicit_assignee_ids("Responsaveis: Joao e Maria", members), ["user-joao", "user-maria"])
        self.assertEqual(detect_explicit_assignee_ids("Pra Ana", members), ["user-ana"])
        self.assertEqual(detect_explicit_assignee_ids("E para Pedro", members), ["user-pedro"])
        self.assertEqual(detect_explicit_assignee_ids("Joao/Maria", members), ["user-joao", "user-maria"])
        self.assertEqual(detect_explicit_assignee_ids("Ana, Pedro e Lucas", members), ["user-ana", "user-pedro", "user-lucas"])

    def test_ambiguous_first_name_does_not_auto_select(self):
        members = (
            AiMemberOption(id="user-joao-silva", name="Joao Silva"),
            AiMemberOption(id="user-joao-pereira", name="Joao Pereira"),
        )
        item = make_item(responsible="Responsavel: Joao")
        context = AiSuggestionContext(members=members, categories=self.categories)
        assignee_ids, warnings = resolve_assignee_ids_for_suggestion(item, context)
        self.assertEqual(assignee_ids, [])
        self.assertTrue(any("ambiguo" in warning for warning in warnings))

    def test_ambiguous_first_name_with_full_name_selects_exact_member(self):
        members = (
            AiMemberOption(id="user-joao-silva", name="Joao Silva"),
            AiMemberOption(id="user-joao-pereira", name="Joao Pereira"),
        )
        self.assertEqual(detect_explicit_assignee_ids("Responsavel: Joao Silva", members), ["user-joao-silva"])

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

    def test_haircut_day_month_without_year_uses_current_year(self):
        item = make_item(title="Cortar cabelo", date="2021-06-05", time="15:00", originalText="Cortar cabelo 05/06 as 15:00")
        response = ImageAnalysisResponse(overallConfidence=0.9, items=[item], needsUserReview=True)
        processed = post_process_image_analysis_response(response, self.context)
        self.assertEqual(processed.items[0].date, "2026-06-05")
        self.assertEqual(processed.items[0].time, "15:00")
        self.assertEqual(processed.items[0].dateYearSource, "inferred")

    def test_day_month_without_year_that_already_passed_moves_to_next_year(self):
        item = make_item(title="Cinema", date="2020-05-23", time="16:30", originalText="Cinema 23/05 16:30")
        future_context = AiSuggestionContext(
            members=self.members,
            categories=self.categories,
            now=datetime(2026, 5, 24, 12, 0, tzinfo=timezone(timedelta(hours=-3))),
        )
        response = ImageAnalysisResponse(overallConfidence=0.9, items=[item], needsUserReview=True)
        processed = post_process_image_analysis_response(response, future_context)
        self.assertEqual(processed.items[0].date, "2027-05-23")
        self.assertEqual(processed.items[0].dateYearSource, "inferred")

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

    def test_explicit_historical_year_is_preserved(self):
        item = make_item(date="2025-06-05", time="15:00", originalText="Registro historico 05/06/2025 as 15:00")
        date_value, time_value, _ = normalize_suggestion_date(item, self.context)
        self.assertEqual(date_value, "2025-06-05")
        self.assertEqual(time_value, "15:00")

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
