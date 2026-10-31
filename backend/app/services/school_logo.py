"""Normalize a school's saved logo and load it for school documents."""
import io
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from reportlab.lib.utils import ImageReader

MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_LOGO_DIMENSION = 4000


def normalize_school_logo(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_LOGO_BYTES + 1)
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="School logo must be 2 MB or smaller.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG"}:
                    raise HTTPException(status_code=422, detail="Choose a PNG or JPEG school logo.")
                if max(source.size) > MAX_LOGO_DIMENSION:
                    raise HTTPException(status_code=422, detail="School logo dimensions must be at most 4000 × 4000 pixels.")
                source.load()
                normalized = ImageOps.exif_transpose(source).convert("RGBA")
                normalized.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                normalized.save(output, format="PNG")
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=422, detail="The school logo could not be read. Choose a valid PNG or JPEG image.") from exc


def organization_logo(organization) -> ImageReader | None:
    if organization is None or not organization.logo:
        return None
    try:
        return ImageReader(io.BytesIO(organization.logo))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="The saved school logo could not be read. Update it in School Profile.") from exc
