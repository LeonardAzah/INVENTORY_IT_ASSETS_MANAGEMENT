from decimal import Decimal

from .exceptions import DomainError

MAX_DIGITS = 14
DECIMAL_PLACES = 3
ZERO = Decimal("0")

def has_valid_precision(quantity, decimal_places):
    """True when `quantity` has no more decimals than the unit allows."""
    quantity = Decimal(str(quantity))
    return quantity == quantity.quantize(Decimal(1).scaleb(-decimal_places))

def validate(quantity, unit, *, what="quantity", allow_negative=False):
    """A stock quantity must be non-zero (positive unless `allow_negative`) and must not
    be more precise than its unit of measure: 1.5 boxes is fine, 1.5 laptops is not."""
    if quantity == ZERO or (quantity < ZERO and not allow_negative):
        raise DomainError(
            "INVALID_QUANTITY", f"The {what} must be greater than zero.", status_code=400
        )
    if not has_valid_precision(quantity, unit.decimal_places):
        raise DomainError(
            "INVALID_QUANTITY_PRECISION",
            f"The unit {unit.code} allows {unit.decimal_places} decimal place(s).",
            context={"unit": unit.code, "decimal_places": unit.decimal_places},
            status_code=400,
        )
    return quantity

def fmt(quantity):
    """A quantity for messages: no trailing zeros."""
    return f"{quantity.normalize():f}"
