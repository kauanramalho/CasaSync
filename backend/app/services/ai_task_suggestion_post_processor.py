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
    r"\b(?:responsavel|responsaveis|responsabilidade|para|com)\b\s*[:=-]?\s*([a-z0-9_.\-\s,&/]+)",
    re.IGNORECASE,
)
HISTORICAL_HINTS = {"historico", "historica", "passado", "passada", "antigo", "antiga", "retroativo"}


@dataclass(frozen=True)
class AiMemberOption:
    id: str
    name: str
    username: str | None = None


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
    return [{"id": member.id, "name": member.name} for member in context.members if member.name]


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
    normalized_text = normalize_lookup_text(text)
    if not normalized_text or not members:
        return []

    candidates: list[str] = []
    for match in RESPONSIBLE_RE.finditer(normalized_text):
        fragment = match.group(1)
        fragment = re.split(r"\b(?:categoria|data|horario|prioridade|lembrete|google|agenda)\b", fragment)[0]
        fragment = re.sub(r"^(?:sera|vai ser|deve ser|ficara para|ficar para|ser|e|eh)\s+", "", fragment).strip()
        candidates.extend(_split_name_candidates(fragment))

    if not candidates:
        return []

    resolved: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        member_id = _member_id_for_name(candidate, members)
        if member_id and member_id not in seen:
            seen.add(member_id)
            resolved.append(member_id)
    return resolved


def resolve_assignee_ids_for_suggestion(item: ImageAnalysisItem | object, context: AiSuggestionContext) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    explicit_text = "\n".join(part for part in [context.custom_instructions, context.image_context] if part)
    explicit_ids = detect_explicit_assignee_ids(explicit_text, context.members)
    if explicit_ids:
        return explicit_ids, ["Responsavel ajustado para respeitar o contexto informado pelo usuario."]

    raw_ids = []
    for value in _list_from_item(item, "assigneeIds"):
        raw_ids.append(str(value))
    single_id = _item_value(item, "assigneeId")
    if single_id:
        raw_ids.append(str(single_id))

    valid_member_ids = {member.id for member in context.members}
    resolved = []
    for value in raw_ids:
        if value in valid_member_ids and value not in resolved:
            resolved.append(value)
    if resolved:
        return resolved, warnings

    responsible = _item_value(item, "responsible")
    if responsible:
        for candidate in _split_name_candidates(normalize_lookup_text(str(responsible))):
            member_id = _member_id_for_name(candidate, context.members)
            if member_id and member_id not in resolved:
                resolved.append(member_id)
        if not resolved:
            warnings.append("Responsavel sugerido pela IA nao existe na familia e foi ignorado.")
    return resolved, warnings


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
        "AI image date normalized: original_text_excerpt=%s ai_date=%s normalized_date=%s timezone=%s",
        _safe_log_excerpt(_item_value(item, "originalText") or _item_value(item, "title") or ""),
        raw_date or original_date.isoformat(),
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
        assignee_ids, assignee_warnings = resolve_assignee_ids_for_suggestion(item, context)
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
            "date": normalized_date,
            "time": normalized_time,
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


def _member_id_for_name(candidate: str, members: tuple[AiMemberOption, ...]) -> str | None:
    normalized_candidate = normalize_lookup_text(candidate)
    if not normalized_candidate:
        return None
    for member in members:
        member_names = [member.name, member.username]
        for name in member_names:
            normalized_name = normalize_lookup_text(name)
            if normalized_name and normalized_candidate == normalized_name:
                return member.id
    return None


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
