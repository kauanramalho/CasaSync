import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings


SECRET_PREFIX = "fernet:"


class SecretDecryptionError(RuntimeError):
    pass


def _fernet(settings: Settings) -> Fernet:
    key_material = settings.integration_token_encryption_key or settings.jwt_secret_key
    digest = hashlib.sha256(key_material.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str | None, settings: Settings) -> str | None:
    if value is None:
        return None
    token = _fernet(settings).encrypt(value.encode("utf-8")).decode("ascii")
    return f"{SECRET_PREFIX}{token}"


def decrypt_secret(value: str | None, settings: Settings) -> str | None:
    if value is None:
        return None
    encrypted = value.removeprefix(SECRET_PREFIX)
    try:
        return _fernet(settings).decrypt(encrypted.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise SecretDecryptionError("Nao foi possivel ler a credencial armazenada.") from exc
