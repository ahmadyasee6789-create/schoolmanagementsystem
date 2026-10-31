from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from typing import Optional

class FeeStructureBase(BaseModel):
    class_id: int = Field(gt=0)
    session_id: int = Field(gt=0)
    monthly_fee: Decimal = Field(ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    admission_fee: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    exam_fee: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)

    @field_validator("monthly_fee", "admission_fee", "exam_fee", mode="before")
    @classmethod
    def reject_boolean_amounts(cls, value):
        if isinstance(value, bool):
            raise ValueError("A monetary amount must be a number")
        return value

    @field_serializer("monthly_fee", "admission_fee", "exam_fee", when_used="json")
    def serialize_amount(self, value):
        # Preserve the existing JSON number contract; all arithmetic uses Decimal.
        return float(value)

class FeeStructureCreate(FeeStructureBase):
    pass

class FeeStructureUpdate(FeeStructureBase):
    pass

class FeeStructureOut(FeeStructureBase):
    id: int
    class_name: Optional[str]  # Optional if you join with Class table

    model_config = ConfigDict(from_attributes=True)
