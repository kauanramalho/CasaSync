from io import BytesIO
import warnings

from fastapi import HTTPException
from PIL import Image


MAX_IMAGE_SIDE = 8000
MAX_IMAGE_PIXELS = 36_000_000
IMAGE_FORMAT_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


def validate_image_content(data: bytes, content_type: str) -> None:
    """Check dimensions and real decoding before storage/provider transmission.

    Called in the thread pool by async upload services. The original bytes are
    preserved; this validation neither edits user media nor logs its content.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=list(IMAGE_FORMAT_TYPES)) as image:
                if IMAGE_FORMAT_TYPES.get(image.format) != content_type:
                    raise HTTPException(status_code=400, detail="O tipo real da imagem nao confere com o arquivo enviado.")
                width, height = image.size
                if width < 1 or height < 1 or max(width, height) > MAX_IMAGE_SIDE or width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Imagem grande demais. Use ate 8000 px por lado e 36 milhoes de pixels.")
                image.verify()
            # verify() alone does not decode all raster data, especially JPEG.
            with Image.open(BytesIO(data), formats=list(IMAGE_FORMAT_TYPES)) as image:
                image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=413, detail="A imagem excede o limite seguro de pixels.") from exc
    except (OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(status_code=400, detail="Nao foi possivel ler a imagem. Use um arquivo PNG, JPG ou WEBP valido.") from exc
