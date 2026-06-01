import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session, selectinload

from app.models.category import Category
from app.models.family import FamilyMember
from app.schemas.image_analysis import ImageAnalysisItem, ImageAnalysisResponse
from app.services.reminder_rules import normalize_reminder_entries


LOGGER = logging.getLogger(__name__)
DEFAULT_TIMEZONE = "America/Sao_Paulo"
SAO_PAULO_FALLBACK_TZ = timezone(timedelta(hours=-3), name="America/Sao_Paulo")
DATE_SLASH_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b")
TIME_RE = re.compile(r"\b(\d{1,2})[:h](\d{2})\b", re.IGNORECASE)
RESPONSIBLE_RE = re.compile(
    r"\b(?:responsavel|responsaveis|responsabilidade|para|pra|com)\b\s*[:=-]?\s*([a-z0-9_.\-\s,&/]+)",
    re.IGNORECASE,
)
ASSIGNEE_STOP_WORD_RE = re.compile(
    r"\b(?:categoria|data|horario|hora|local|prioridade|lembrete|google|agenda|descricao|observacao|obs|titulo)\b"
)
ASSIGNEE_FUZZY_STOP_WORDS = {
    "a",
    "as",
    "com",
    "de",
    "do",
    "da",
    "e",
    "eh",
    "em",
    "imagem",
    "original",
    "para",
    "pra",
    "responsavel",
    "responsaveis",
    "sera",
    "serao",
    "sugestao",
}
ASSIGNEE_TEXT_FIELDS = (
    "assignee",
    "assignees",
    "assigneeName",
    "assigneeNames",
    "responsible",
    "responsibles",
    "responsibleName",
    "responsibleNames",
    "suggestedResponsible",
    "suggestedResponsibles",
    "originalAssigneeText",
    "originalResponsibleText",
)
HISTORICAL_HINTS = {"historico", "historica", "passado", "passada", "antigo", "antiga", "retroativo"}


@dataclass(frozen=True)
class AiMemberOption:
    id: str
    name: str
    username: str | None = None
    email: str | None = None


@dataclass(frozen=True)
class AiCategoryOption:
    id: str
    name: str
    icon: str | None = None
    color: str | None = None
    is_default: bool = False


@dataclass(frozen=True)
class AiSuggestionContext:
    members: tuple[AiMemberOption, ...] = ()
    categories: tuple[AiCategoryOption, ...] = ()
    timezone_name: str = DEFAULT_TIMEZONE
    now: datetime | None = None
    custom_instructions: str | None = None
    image_context: str | None = None


@dataclass(frozen=True)
class AssigneeResolution:
    ids: list[str]
    warnings: list[str]
    had_signal: bool = False
    status: str = "unresolved"


@dataclass(frozen=True)
class SuggestionAssigneeResolution:
    ids: list[str]
    names: list[str]
    status: str
    warnings: list[str]
    original_text: str | None


def normalize_lookup_text(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9_.\-\s,&/]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_ai_suggestion_context(
    db: Session,
    family_id: str,
    *,
    custom_instructions: str | None = None,
    image_context: str | None = None,
    now: datetime | None = None,
    timezone_name: str = DEFAULT_TIMEZONE,
) -> AiSuggestionContext:
    members = (
        db.query(FamilyMember)
        .options(selectinload(FamilyMember.user))
        .filter(FamilyMember.family_id == family_id)
        .all()
    )
    categories = (
        db.query(Category)
        .filter(Category.family_id == family_id)
        .order_by(Category.is_default.desc(), Category.name.asc())
        .all()
    )
    return AiSuggestionContext(
        members=tuple(
            AiMemberOption(
                id=member.user_id,
                name=(member.user.name if member.user else "").strip(),
                username=(member.user.username if member.user else None),
                email=(member.user.email if member.user else None),
            )
            for member in members
            if member.user_id and member.user
        ),
        categories=tuple(
            AiCategoryOption(
                id=category.id,
                name=category.name,
                icon=category.icon,
                color=category.color,
                is_default=bool(category.is_default),
            )
            for category in categories
        ),
        timezone_name=timezone_name,
        now=now,
        custom_instructions=custom_instructions,
        image_context=image_context,
    )


def members_for_prompt(context: AiSuggestionContext) -> list[dict]:
    members = []
    for member in context.members:
        if not member.name:
            continue
        payload = {
            "id": member.id,
            "name": member.name,
            "firstName": _first_name(member.name),
        }
        if member.username:
            payload["username"] = member.username
        members.append(payload)
    return members


def categories_for_prompt(context: AiSuggestionContext) -> list[dict]:
    return [
        {
            "id": category.id,
            "name": category.name,
            "description": _category_description(category),
        }
        for category in context.categories
    ]


def current_backend_datetime_for_prompt(context: AiSuggestionContext) -> str:
    now = _context_now(context)
    return now.isoformat()


def detect_explicit_assignee_ids(text: str | None, members: tuple[AiMemberOption, ...]) -> list[str]:
    return _resolve_assignees_from_text(text, members, require_explicit=True).ids


def resolve_assignee_resolution_for_suggestion(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> SuggestionAssigneeResolution:
    context_sources = (
        ("contexto da imagem", context.image_context),
        ("instrucoes personalizadas", context.custom_instructions),
        ("texto extraido da imagem", _item_value(item, "originalText")),
    )
    for source_label, source_text in context_sources:
        resolution = _resolve_assignees_from_text(source_text, context.members, require_explicit=True)
        _log_assignee_resolution(source_label, source_text, context.members, resolution)
        if resolution.had_signal:
            return _suggestion_assignee_resolution(resolution, context.members, source_text)

    for field_name in ASSIGNEE_TEXT_FIELDS:
        source_text = _item_value(item, field_name)
        resolution = _resolve_assignees_from_text(source_text, context.members, require_explicit=False)
        _log_assignee_resolution(f"campo {field_name}", source_text, context.members, resolution)
        if resolution.had_signal:
            warnings = resolution.warnings
            if not resolution.ids and not warnings:
                warnings = ["Responsavel sugerido pela IA precisa ser confirmado na lista de membros."]
            return _suggestion_assignee_resolution(
                AssigneeResolution(ids=resolution.ids, warnings=warnings, had_signal=True, status=resolution.status),
                context.members,
                source_text,
            )

    raw_ids = _valid_raw_assignee_ids(item, context.members)
    if raw_ids:
        return SuggestionAssigneeResolution(
            ids=raw_ids,
            names=_assignee_names_for_ids(context.members, raw_ids),
            status="resolved",
            warnings=[],
            original_text=None,
        )

    return SuggestionAssigneeResolution(ids=[], names=[], status="unresolved", warnings=[], original_text=None)


def resolve_assignee_ids_for_suggestion(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> tuple[list[str], list[str]]:
    resolution = resolve_assignee_resolution_for_suggestion(item, context)
    return resolution.ids, resolution.warnings


def resolve_category_id_for_suggestion(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> tuple[str | None, list[str]]:
    if not context.categories:
        return None, ["Nenhuma categoria da familia esta disponivel para vincular a sugestao."]

    valid_category_ids = {category.id for category in context.categories}
    raw_category_id = _item_value(item, "categoryId")
    category_id = str(raw_category_id).strip() if raw_category_id else None

    semantic_category = _best_semantic_category(item, context)
    if semantic_category:
        if category_id and category_id != semantic_category.id:
            return semantic_category.id, ["Categoria ajustada para uma categoria existente mais compativel."]
        return semantic_category.id, []

    if category_id in valid_category_ids:
        return category_id, []

    category_name = _item_value(item, "category")
    if category_name:
        normalized_name = normalize_lookup_text(str(category_name))
        for category in context.categories:
            if normalize_lookup_text(category.name) == normalized_name:
                return category.id, []
        return _fallback_category(context).id, ["Categoria sugerida pela IA nao existe e foi substituida por uma categoria segura."]

    fallback = _fallback_category(context)
    return fallback.id, ["Categoria nao identificada; foi usada uma categoria segura existente."]


def normalize_suggestion_date(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> tuple[str | None, str | None, list[str]]:
    warnings: list[str] = []
    now_local = _context_now(context)
    current_year = now_local.year
    combined_text = _combined_text(item, context)
    date_source_text = _date_source_text(item, context)
    year_explicit = _has_explicit_year(date_source_text)
    historical = _looks_historical(combined_text)

    raw_date = _item_value(item, "date")
    raw_time = _item_value(item, "time")
    date_value = _parse_iso_date(str(raw_date)) if raw_date else None
    time_value = _parse_time(str(raw_time)) if raw_time else _extract_time(combined_text)
    extracted_day_month = _extract_day_month(combined_text)

    if date_value is None and extracted_day_month:
        day, month, year = extracted_day_month
        resolved_year = year or current_year
        date_value = _safe_date(resolved_year, month, day)
        if date_value:
            warnings.append("Data ajustada usando dia e mes identificados no texto da imagem/contexto.")

    normalized_time = raw_time if _parse_time(str(raw_time)) else (time_value.strftime("%H:%M") if time_value else None)
    if date_value is None:
        return None, normalized_time, warnings

    original_date = date_value
    if date_value.year < current_year and not historical:
        date_value = _safe_date(current_year, date_value.month, date_value.day) or date_value
        warnings.append("Ano antigo retornado pela IA foi corrigido para o ano atual.")

    comparison_time = time_value or time(hour=23, minute=59)
    candidate_local = datetime.combine(date_value, comparison_time, tzinfo=now_local.tzinfo)
    if candidate_local < now_local and not historical:
        date_value = _safe_date(date_value.year + 1, date_value.month, date_value.day) or date_value
        warnings.append("Data ajustada para o proximo ano porque a data no ano atual ja passou.")

    normalized_date = date_value.isoformat()
    LOGGER.info(
        "AI image date normalized: original_text_excerpt=%s ai_date=%s year_explicit=%s normalized_date=%s timezone=%s",
        _safe_log_excerpt(_item_value(item, "originalText") or _item_value(item, "title") or ""),
        raw_date or original_date.isoformat(),
        year_explicit,
        normalized_date,
        context.timezone_name,
    )
    return normalized_date, normalized_time, warnings


def normalize_suggestion_reminders(item: ImageAnalysisItem | object) -> tuple[list[dict], list[str]]:
    raw_reminders = []
    raw_reminders.extend(_list_from_item(item, "reminders"))
    reminder_value = _item_value(item, "reminderValue")
    reminder_unit = _item_value(item, "reminderUnit")
    if reminder_value and reminder_unit:
        raw_reminders.append({"value": reminder_value, "unit": reminder_unit})

    normalized, invalid_count, _ = normalize_reminder_entries(raw_reminders)
    reminders = [{"value": value, "unit": unit} for value, unit in normalized]
    warnings = []
    if invalid_count:
        warnings.append("Lembretes fora das opcoes permitidas foram ignorados.")
    return reminders, warnings


def post_process_image_analysis_response(response: ImageAnalysisResponse, context: AiSuggestionContext) -> ImageAnalysisResponse:
    processed_items: list[ImageAnalysisItem] = []
    global_warnings = list(response.warnings or [])
    changed = False

    for item in response.items:
        warnings = list(item.warnings or [])
        assignee_resolution = resolve_assignee_resolution_for_suggestion(item, context)
        assignee_ids = assignee_resolution.ids
        assignee_warnings = assignee_resolution.warnings
        category_id, category_warnings = resolve_category_id_for_suggestion(item, context)
        normalized_date, normalized_time, date_warnings = normalize_suggestion_date(item, context)
        reminders, reminder_warnings = normalize_suggestion_reminders(item)
        warnings.extend(assignee_warnings)
        warnings.extend(category_warnings)
        warnings.extend(date_warnings)
        warnings.extend(reminder_warnings)

        first_reminder = reminders[0] if reminders else None
        patch = {
            "categoryId": category_id,
            "assigneeIds": assignee_ids,
            "assigneeId": assignee_ids[0] if assignee_ids else None,
            "assigneeNames": assignee_resolution.names,
            "resolvedAssigneeNames": assignee_resolution.names,
            "originalAssigneeText": assignee_resolution.original_text,
            "assigneeResolutionStatus": assignee_resolution.status,
            "assigneeResolutionWarnings": assignee_resolution.warnings,
            "date": normalized_date,
            "time": normalized_time,
            "dateYearSource": _date_year_source(item, context, normalized_date),
            "warnings": list(dict.fromkeys(warnings))[:10],
            "reminders": reminders,
            "reminderEnabled": bool(reminders and normalized_date),
            "reminderValue": first_reminder["value"] if first_reminder else None,
            "reminderUnit": first_reminder["unit"] if first_reminder else None,
        }
        changed = changed or any(getattr(item, key, None) != value for key, value in patch.items())
        processed_items.append(ImageAnalysisItem.model_validate({**item.model_dump(), **patch}))

    if changed:
        global_warnings.append("Alguns campos foram ajustados automaticamente para usar membros, categorias, datas e lembretes validos.")

    confidence_values = [item.confidence for item in processed_items]
    overall_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else response.overallConfidence
    return response.model_copy(
        update={
            "items": processed_items,
            "overallConfidence": overall_confidence,
            "warnings": list(dict.fromkeys(global_warnings))[:10],
            "totalSuggestionsGenerated": len(processed_items),
        }
    )


def _category_description(category: AiCategoryOption) -> str:
    tags = []
    normalized = normalize_lookup_text(category.name)
    for group_name, config in CATEGORY_GROUPS.items():
        if any(keyword in normalized for keyword in config["category"]):
            tags.append(group_name)
    if category.icon:
        tags.append(f"icone:{category.icon}")
    return ", ".join(tags) or ("padrao da familia" if category.is_default else "categoria personalizada")


CATEGORY_GROUPS = {
    "relacionamento_lazer_casal": {
        "input": {"cinema", "filme", "sessao", "date", "passeio", "encontro", "casal", "namoro", "jantar", "restaurante", "shopping", "boulevard", "lazer"},
        "category": {"relacionamento", "casal", "lazer", "date", "passeio", "pessoal"},
        "preferred": {"relacionamento", "casal", "lazer"},
    },
    "academico_estudos": {
        "input": {"faculdade", "prova", "avaliacao", "trabalho", "estudo", "estudar", "materia", "aula", "atividade", "seminario", "facul"},
        "category": {"faculdade", "estudos", "academico", "educacao", "escola"},
        "preferred": {"faculdade", "estudos", "academico"},
    },
    "casa": {
        "input": {"casa", "limpeza", "organizacao", "arrumar", "lavar", "cozinha", "quarto", "banheiro"},
        "category": {"casa", "lar"},
    },
    "trabalho": {
        "input": {"reuniao", "empresa", "cliente", "projeto", "trabalho", "entrega"},
        "category": {"trabalho", "profissional"},
    },
    "saude": {
        "input": {"consulta", "medico", "medica", "exame", "dentista", "remedio", "saude"},
        "category": {"saude", "medico", "consulta"},
    },
    "compras": {
        "input": {"comprar", "mercado", "supermercado", "lista de compras", "shopping"},
        "category": {"compras", "mercado"},
    },
    "financas": {
        "input": {"pagar", "boleto", "conta", "pix", "dinheiro", "financas", "financeiro"},
        "category": {"financas", "financeiro", "contas"},
    },
}


def _best_semantic_category(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> AiCategoryOption | None:
    haystack = normalize_lookup_text(
        " ".join(
            part
            for part in [
                _item_value(item, "title"),
                _item_value(item, "description"),
                _item_value(item, "originalText"),
                _item_value(item, "category"),
                context.image_context,
                context.custom_instructions,
            ]
            if part
        )
    )
    if not haystack:
        return None

    best: tuple[int, AiCategoryOption] | None = None
    for category in context.categories:
        category_text = normalize_lookup_text(" ".join(part for part in [category.name, category.icon] if part))
        score = 0
        if normalize_lookup_text(category.name) and normalize_lookup_text(category.name) in haystack:
            score += 5
        for config in CATEGORY_GROUPS.values():
            input_hits = sum(1 for keyword in config["input"] if keyword in haystack)
            if not input_hits:
                continue
            category_hits = sum(1 for keyword in config["category"] if keyword in category_text)
            if category_hits:
                score += 3 * input_hits + 2 * category_hits
                score += 5 if any(keyword in category_text for keyword in config.get("preferred", set())) else 0
        if score and (best is None or score > best[0]):
            best = (score, category)
    return best[1] if best else None


def _fallback_category(context: AiSuggestionContext) -> AiCategoryOption:
    default = next((category for category in context.categories if category.is_default), None)
    return default or context.categories[0]


def _context_now(context: AiSuggestionContext) -> datetime:
    try:
        local_zone = ZoneInfo(context.timezone_name or DEFAULT_TIMEZONE)
    except ZoneInfoNotFoundError:
        local_zone = SAO_PAULO_FALLBACK_TZ
    now = context.now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(local_zone)


def _combined_text(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> str:
    return " ".join(
        part
        for part in [
            _item_value(item, "title"),
            _item_value(item, "description"),
            _item_value(item, "originalText"),
            context.image_context,
            context.custom_instructions,
        ]
        if part
    )


def _date_source_text(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> str:
    return " ".join(
        part
        for part in [
            _item_value(item, "originalText"),
            context.image_context,
            context.custom_instructions,
        ]
        if part
    )


def _has_explicit_year(text: str | None) -> bool:
    source = str(text or "")
    if re.search(r"\b(?:19|20)\d{2}\b", source):
        return True
    return any(match.group(3) for match in DATE_SLASH_RE.finditer(source))


def _date_year_source(item: ImageAnalysisItem | object, context: AiSuggestionContext, normalized_date: str | None) -> str | None:
    if not normalized_date:
        return "unknown"
    return "explicit" if _has_explicit_year(_date_source_text(item, context)) else "inferred"


def _looks_historical(text: str | None) -> bool:
    normalized = normalize_lookup_text(text)
    return any(hint in normalized for hint in HISTORICAL_HINTS)


def _parse_iso_date(value: str):
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _parse_time(value: str):
    try:
        return datetime.strptime(value[:5], "%H:%M").time()
    except (TypeError, ValueError):
        return None


def _extract_time(text: str | None) -> time | None:
    match = TIME_RE.search(str(text or ""))
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return time(hour=hour, minute=minute)
    return None


def _extract_day_month(text: str | None) -> tuple[int, int, int | None] | None:
    for match in DATE_SLASH_RE.finditer(str(text or "")):
        day = int(match.group(1))
        month = int(match.group(2))
        raw_year = match.group(3)
        year = None
        if raw_year:
            year = int(raw_year)
            if year < 100:
                year += 2000
        if _safe_date(year or 2024, month, day):
            return day, month, year
    return None


def _safe_date(year: int, month: int, day: int):
    try:
        return datetime(year=year, month=month, day=day).date()
    except ValueError:
        return None


def _split_name_candidates(value: str) -> list[str]:
    return [
        candidate.strip()
        for candidate in re.split(r"\s+(?:e|and)\s+|[,/&]+", normalize_lookup_text(value))
        if candidate.strip()
    ]


def _candidate_name_tokens(value: str) -> list[str]:
    tokens = []
    for token in re.findall(r"\b[a-z0-9_.-]{3,40}\b", normalize_lookup_text(value)):
        if token in ASSIGNEE_FUZZY_STOP_WORDS:
            continue
        if token not in tokens:
            tokens.append(token)
    return tokens[:20]


def _fuzzy_member_aliases(member: AiMemberOption) -> list[str]:
    aliases = []
    for value in [_first_name(member.name), member.username, _email_local_part(member.email)]:
        normalized = normalize_lookup_text(value)
        if normalized and len(normalized) >= 4 and normalized not in aliases:
            aliases.append(normalized)
    return aliases


def _max_fuzzy_distance(alias: str) -> int:
    length = len(alias)
    if length < 4:
        return 0
    if length <= 6:
        return 1
    return 2


def _levenshtein_distance(left: str, right: str, *, max_distance: int) -> int | None:
    if left == right:
        return 0
    if abs(len(left) - len(right)) > max_distance:
        return None

    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        row_min = current[0]
        for right_index, right_char in enumerate(right, start=1):
            insert_cost = current[right_index - 1] + 1
            delete_cost = previous[right_index] + 1
            replace_cost = previous[right_index - 1] + (0 if left_char == right_char else 1)
            value = min(insert_cost, delete_cost, replace_cost)
            current.append(value)
            row_min = min(row_min, value)
        if row_min > max_distance:
            return None
        previous = current

    distance = previous[-1]
    return distance if distance <= max_distance else None


def _assignee_resolution_status(ids: list[str], warnings: list[str]) -> str:
    if ids:
        return "resolved"
    if any("ambiguo" in warning for warning in warnings):
        return "ambiguous"
    if warnings:
        return "not_found"
    return "unresolved"


def _assignee_names_for_ids(members: tuple[AiMemberOption, ...], ids: list[str]) -> list[str]:
    by_id = {member.id: member.name for member in members}
    return [by_id[member_id] for member_id in ids if by_id.get(member_id)]


def _suggestion_assignee_resolution(
    resolution: AssigneeResolution,
    members: tuple[AiMemberOption, ...],
    original_text: str | list | tuple | None,
) -> SuggestionAssigneeResolution:
    return SuggestionAssigneeResolution(
        ids=resolution.ids,
        names=_assignee_names_for_ids(members, resolution.ids),
        status=resolution.status,
        warnings=resolution.warnings,
        original_text=_safe_log_excerpt(_stringify_assignee_text(original_text)) or None,
    )


def _resolve_assignees_from_text(
    text: str | list | tuple | None,
    members: tuple[AiMemberOption, ...],
    *,
    require_explicit: bool,
) -> AssigneeResolution:
    raw_text = _stringify_assignee_text(text)
    normalized_text = normalize_lookup_text(raw_text)
    if not normalized_text or not members:
        return AssigneeResolution(ids=[], warnings=[], had_signal=False, status="unresolved")

    fragments: list[str] = []
    explicit_signal = False
    for match in RESPONSIBLE_RE.finditer(normalized_text):
        explicit_signal = True
        fragment = ASSIGNEE_STOP_WORD_RE.split(match.group(1), maxsplit=1)[0]
        fragment = re.sub(r"^(?:sera|serao|vai ser|deve ser|ficara para|ficar para|ser|e|eh)\s+", "", fragment).strip()
        if fragment:
            fragments.append(fragment)

    if not fragments and (not require_explicit or _looks_like_name_list(normalized_text, members)):
        fragments.append(normalized_text)

    if require_explicit and not explicit_signal and not _looks_like_name_list(normalized_text, members):
        return AssigneeResolution(ids=[], warnings=[], had_signal=False, status="unresolved")

    ids: list[str] = []
    warnings: list[str] = []
    had_signal = explicit_signal or bool(fragments)
    for fragment in fragments:
        fragment_resolution = _resolve_assignees_from_fragment(fragment, members)
        for member_id in fragment_resolution.ids:
            if member_id not in ids:
                ids.append(member_id)
        warnings.extend(fragment_resolution.warnings)

    unique_warnings = list(dict.fromkeys(warnings))[:5]
    return AssigneeResolution(
        ids=ids,
        warnings=unique_warnings,
        had_signal=had_signal,
        status=_assignee_resolution_status(ids, unique_warnings),
    )


def _resolve_assignees_from_fragment(fragment: str, members: tuple[AiMemberOption, ...]) -> AssigneeResolution:
    normalized_fragment = normalize_lookup_text(fragment)
    if not normalized_fragment:
        return AssigneeResolution(ids=[], warnings=[], had_signal=False, status="unresolved")

    ids: list[str] = []
    warnings: list[str] = []
    exact_matched_first_names: set[str] = set()

    for member in members:
        for alias in _strong_member_aliases(member):
            if _text_contains_alias(normalized_fragment, alias):
                if member.id not in ids:
                    ids.append(member.id)
                first_name = _first_name(member.name)
                if first_name:
                    exact_matched_first_names.add(first_name)
                break

    first_name_index = _first_name_index(members)
    for first_name, matches in first_name_index.items():
        if not first_name or not _text_contains_alias(normalized_fragment, first_name):
            continue
        if len(matches) == 1:
            member_id = matches[0].id
            if member_id not in ids:
                ids.append(member_id)
            continue
        if first_name not in exact_matched_first_names:
            warnings.append(f"Responsavel '{first_name}' e ambiguo nesta familia; confirme manualmente.")

    fuzzy_resolution = _resolve_fuzzy_assignees_from_fragment(normalized_fragment, members, set(ids))
    for member_id in fuzzy_resolution.ids:
        if member_id not in ids:
            ids.append(member_id)
    warnings.extend(fuzzy_resolution.warnings)

    unique_warnings = list(dict.fromkeys(warnings))[:5]
    if ids:
        return AssigneeResolution(ids=ids, warnings=unique_warnings, had_signal=True, status=_assignee_resolution_status(ids, unique_warnings))
    return AssigneeResolution(
        ids=[],
        warnings=unique_warnings or ["Responsavel sugerido nao foi encontrado entre os membros da familia."],
        had_signal=True,
        status="ambiguous" if any("ambiguo" in warning for warning in unique_warnings) else "not_found",
    )


def _resolve_fuzzy_assignees_from_fragment(
    normalized_fragment: str,
    members: tuple[AiMemberOption, ...],
    already_resolved_ids: set[str],
) -> AssigneeResolution:
    tokens = _candidate_name_tokens(normalized_fragment)
    if not tokens:
        return AssigneeResolution(ids=[], warnings=[], had_signal=False, status="unresolved")

    matches_by_token: dict[str, list[tuple[int, AiMemberOption, str]]] = {}
    for token in tokens:
        for member in members:
            if member.id in already_resolved_ids:
                continue
            for alias in _fuzzy_member_aliases(member):
                max_distance = _max_fuzzy_distance(alias)
                if max_distance <= 0:
                    continue
                distance = _levenshtein_distance(token, alias, max_distance=max_distance)
                if distance is not None and 0 < distance <= max_distance:
                    matches_by_token.setdefault(token, []).append((distance, member, alias))

    ids: list[str] = []
    warnings: list[str] = []
    for token, matches in matches_by_token.items():
        best_distance = min(distance for distance, _, _ in matches)
        best_members = []
        seen_ids = set()
        for distance, member, _ in matches:
            if distance == best_distance and member.id not in seen_ids:
                best_members.append(member)
                seen_ids.add(member.id)
        if len(best_members) == 1:
            member_id = best_members[0].id
            if member_id not in ids:
                ids.append(member_id)
            continue
        warnings.append(f"Responsavel parecido com '{token}' e ambiguo nesta familia; confirme manualmente.")

    return AssigneeResolution(
        ids=ids,
        warnings=list(dict.fromkeys(warnings))[:5],
        had_signal=bool(ids or warnings),
        status=_assignee_resolution_status(ids, warnings),
    )


def _valid_raw_assignee_ids(item: ImageAnalysisItem | object, members: tuple[AiMemberOption, ...]) -> list[str]:
    raw_ids = []
    for value in _list_from_item(item, "assigneeIds"):
        raw_ids.append(str(value))
    single_id = _item_value(item, "assigneeId")
    if single_id:
        raw_ids.append(str(single_id))

    valid_member_ids = {member.id for member in members}
    resolved = []
    for value in raw_ids:
        if value in valid_member_ids and value not in resolved:
            resolved.append(value)
    return resolved


def _stringify_assignee_text(value: str | list | tuple | None) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(_stringify_assignee_text(item) for item in value)
    return str(value)


def _strong_member_aliases(member: AiMemberOption) -> list[str]:
    aliases = []
    for value in [member.name, member.username, member.email, _email_local_part(member.email)]:
        normalized = normalize_lookup_text(value)
        if normalized and len(normalized) >= 2 and normalized not in aliases:
            aliases.append(normalized)
    return aliases


def _first_name_index(members: tuple[AiMemberOption, ...]) -> dict[str, list[AiMemberOption]]:
    index: dict[str, list[AiMemberOption]] = {}
    for member in members:
        first_name = _first_name(member.name)
        if first_name:
            index.setdefault(first_name, []).append(member)
    return index


def _first_name(name: str | None) -> str:
    normalized = normalize_lookup_text(name)
    return normalized.split(" ", 1)[0] if normalized else ""


def _email_local_part(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return email.split("@", 1)[0]


def _text_contains_alias(text: str, alias: str) -> bool:
    normalized_text = normalize_lookup_text(text)
    normalized_alias = normalize_lookup_text(alias)
    if not normalized_text or not normalized_alias:
        return False
    return re.search(rf"(^|[\s,.;/&-]){re.escape(normalized_alias)}($|[\s,.;/&-])", normalized_text) is not None


def _looks_like_name_list(text: str, members: tuple[AiMemberOption, ...]) -> bool:
    normalized_text = normalize_lookup_text(text)
    if not normalized_text or len(normalized_text) > 120:
        return False
    separators_removed = re.sub(r"\s+(?:e|and)\s+|[,/&]+", " ", normalized_text)
    remaining = separators_removed
    for member in members:
        aliases = sorted(_strong_member_aliases(member) + [_first_name(member.name)], key=len, reverse=True)
        for alias in aliases:
            if alias:
                remaining = re.sub(rf"(^|\s){re.escape(alias)}($|\s)", " ", remaining)
    return not re.sub(r"\s+", "", remaining)


def _log_assignee_resolution(
    source_label: str,
    text: str | list | tuple | None,
    members: tuple[AiMemberOption, ...],
    resolution: AssigneeResolution,
) -> None:
    if not LOGGER.isEnabledFor(logging.DEBUG) or not resolution.had_signal:
        return
    LOGGER.debug(
        "AI assignee resolution source=%s text_excerpt=%s members=%s resolved_ids=%s warnings=%s",
        source_label,
        _safe_log_excerpt(_stringify_assignee_text(text)),
        [{"id": member.id, "name": member.name} for member in members],
        resolution.ids,
        resolution.warnings,
    )


def _item_value(item: ImageAnalysisItem | object, name: str):
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def _list_from_item(item: ImageAnalysisItem | object, name: str) -> list:
    value = _item_value(item, name)
    return value if isinstance(value, list) else []


def _safe_log_excerpt(value: str | None) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:120]
