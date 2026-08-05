import unittest

from app.schemas.image_analysis import ImageAnalysisItem
from app.services.ai_task_suggestion_post_processor import (
    AiMemberOption,
    AiSuggestionContext,
    resolve_assignee_resolution_for_suggestion,
)


def item(responsible):
    return ImageAnalysisItem(
        type="event",
        title="Escala",
        responsible=responsible,
        confidence=0.95,
        sourceEvidence={"personText": responsible},
    )


class AiAliasSecurityTest(unittest.TestCase):
    def test_only_explicit_backend_alias_resolves_in_real_context(self):
        context = AiSuggestionContext(
            members=(AiMemberOption(id="user-kauan", name="Kauan Ramalho", aliases=("Cauã",)),),
            enforce_explicit_aliases=True,
        )
        resolved = resolve_assignee_resolution_for_suggestion(item("Cauã"), context)
        unknown = resolve_assignee_resolution_for_suggestion(item("Kuan"), context)
        self.assertEqual(resolved.ids, ["user-kauan"])
        self.assertEqual(unknown.ids, [])
        self.assertEqual(unknown.status, "not_found")

    def test_duplicate_authorized_alias_is_ambiguous(self):
        context = AiSuggestionContext(
            members=(
                AiMemberOption(id="user-a", name="Ana", aliases=("Bia",)),
                AiMemberOption(id="user-b", name="Beatriz", aliases=("Bia",)),
            ),
            enforce_explicit_aliases=True,
        )
        resolved = resolve_assignee_resolution_for_suggestion(item("Bia"), context)
        self.assertEqual(resolved.ids, [])
        self.assertEqual(resolved.status, "ambiguous")


if __name__ == "__main__":
    unittest.main()
