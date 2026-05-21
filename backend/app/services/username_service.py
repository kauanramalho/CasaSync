import re


USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 30
USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]+$")


def normalize_username(value: str | None, *, required: bool = True) -> str | None:
    if value is None:
        if required:
            raise ValueError("Informe um username.")
        return None

    normalized = value.strip().lower()
    if not normalized:
        if required:
            raise ValueError("Informe um username.")
        return None

    if len(normalized) < USERNAME_MIN_LENGTH:
        raise ValueError("Username deve ter pelo menos 3 caracteres.")
    if len(normalized) > USERNAME_MAX_LENGTH:
        raise ValueError("Username deve ter no maximo 30 caracteres.")
    if any(char.isspace() for char in normalized) or not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("Use apenas letras, numeros, ponto, underline ou hifen no username.")
    if not any(char.isalnum() for char in normalized):
        raise ValueError("Username deve conter pelo menos uma letra ou numero.")

    return normalized


def normalize_login_identifier(value: str) -> str:
    return value.strip().lower()


def looks_like_email(value: str) -> bool:
    return "@" in value


def username_seed_from_email(email: str | None) -> str:
    prefix = (email or "").split("@", 1)[0].strip().lower()
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", prefix).strip("._-")
    if len(cleaned) < USERNAME_MIN_LENGTH:
        cleaned = f"user{cleaned}"
    return cleaned[:USERNAME_MAX_LENGTH].strip("._-") or "user"


def unique_username_from_seed(seed: str, used_usernames: set[str]) -> str:
    base = normalize_username(seed, required=True) or "user"
    if base not in used_usernames:
        return base

    for suffix in range(2, 10000):
        suffix_text = f"-{suffix}"
        candidate = f"{base[:USERNAME_MAX_LENGTH - len(suffix_text)]}{suffix_text}"
        if candidate not in used_usernames:
            return candidate

    raise RuntimeError("Nao foi possivel gerar um username unico.")


def unique_username_from_email(email: str | None, used_usernames: set[str]) -> str:
    return unique_username_from_seed(username_seed_from_email(email), used_usernames)
