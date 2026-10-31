from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SheetMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sheet_index: int = Field(ge=0)
    header_row: int = Field(ge=1, le=20)
    fields: dict[str, str]  # Zero-based column indexes remain unique for repeated headers.
    classroom_id: int | None = Field(default=None, gt=0)


class StudentImportValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: str = Field(min_length=36, max_length=36)
    sheets: list[SheetMapping] = Field(min_length=1, max_length=50)
    enrollment_date: date
    date_format: Literal["iso", "dmy", "mdy"] = "iso"


class StudentImportConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: str = Field(min_length=36, max_length=36)
    validation_id: str = Field(min_length=36, max_length=36)
    row_ids: list[str] = Field(min_length=1, max_length=10000)
