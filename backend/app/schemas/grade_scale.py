"""Organization-owned grading bands; ownership is never accepted as input."""
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Percentage = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2, allow_inf_nan=False)]


class GradeScaleInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    grade: str = Field(min_length=1, max_length=50)
    min_percentage: Percentage
    max_percentage: Percentage
    gpa: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @field_validator("min_percentage", "max_percentage", "gpa", mode="before")
    @classmethod
    def reject_boolean(cls, value):
        if isinstance(value, bool):
            raise ValueError("Enter a number, not a boolean")
        return value

    @model_validator(mode="after")
    def ordered_range(self):
        if self.min_percentage > self.max_percentage:
            raise ValueError("Minimum percentage cannot exceed maximum percentage")
        return self


class GradeScaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grade: str
    min_percentage: float
    max_percentage: float
    gpa: float | None


class CoverageGap(BaseModel):
    minimum: float
    maximum: float


class GradeScaleList(BaseModel):
    items: list[GradeScaleOut]
    complete: bool
    gaps: list[CoverageGap]
    issues: list[str]
    can_manage: bool
    history_locked: bool
    require_complete_for_finalization: bool = True
