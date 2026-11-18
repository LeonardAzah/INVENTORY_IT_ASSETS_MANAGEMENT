from decimal import Decimal, InvalidOperation

from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..choices import SpecDataType
from ..models import Item, SpecificationField, SpecificationTemplate

TEMPLATE_AUDITED = ("code", "name", "description", "is_active")
FIELD_AUDITED = (
    "key",
    "label",
    "data_type",
    "required",
    "choices",
    "min_value",
    "max_value",
    "decimal_places",
    "unit_label",
    "help_text",
    "sort_order",
    "is_active",
)

TEXT_MAX_LENGTH = 255
NUMERIC = (SpecDataType.INTEGER, SpecDataType.DECIMAL, SpecDataType.MEASURE)
WITH_DECIMALS = (SpecDataType.DECIMAL, SpecDataType.MEASURE)
WITH_CHOICES = (SpecDataType.CHOICE, SpecDataType.MULTI_CHOICE)


def _invalid(error_code, message, **context):
    return DomainError(error_code, message, context=context, status_code=400)

# Templates
@transaction.atomic
def create_template(actor, *, code, name, description=""):
    policy.require(actor, Code.SPEC_TEMPLATE_MANAGE)
    template = SpecificationTemplate.objects.create(
        code=code.upper(), name=name, description=description, created_by=actor
    )
    audit.record(
        actor,
        "items.specification_template.created",
        template,
        after=audit.snapshot(template, TEMPLATE_AUDITED),
    )
    return template

@transaction.atomic
def update_template(actor, template, **changes):
    policy.require(actor, Code.SPEC_TEMPLATE_MANAGE)
    template = SpecificationTemplate.objects.select_for_update().get(pk=template.pk)
    before = audit.snapshot(template, TEMPLATE_AUDITED)
    for name, value in changes.items():
        setattr(template, name, value)
    after = audit.snapshot(template, TEMPLATE_AUDITED)
    if after == before:
        return template
    template.save()
    audit.record(
        actor, "items.specification_template.updated", template, before=before, after=after
    )
    return template


# Fields
def _items_using(field):
    """Items whose specifications hold a value for this field."""
    return Item.objects.filter(
        category__specification_template_id=field.template_id,
        specifications__has_key=field.key,
    )

def _choice_in_use(field, choice):
    items = _items_using(field)
    if field.data_type == SpecDataType.CHOICE:
        return items.filter(**{f"specifications__{field.key}": choice}).exists()
    return items.filter(**{f"specifications__{field.key}__contains": [choice]}).exists()

def _check_definition(field):
    """The rules of a field must suit its kind of value."""
    data_type = field.data_type
    if data_type in WITH_CHOICES:
        choices = field.choices
        if (
            not isinstance(choices, list)
            or not choices
            or not all(isinstance(choice, str) and choice.strip() for choice in choices)
        ):
            raise _invalid("SPEC_FIELD_INVALID", "List at least one choice.", field="choices")
        if len({choice.strip().casefold() for choice in choices}) != len(choices):
            raise _invalid("SPEC_FIELD_INVALID", "The choices repeat a value.", field="choices")
        field.choices = [choice.strip() for choice in choices]
    elif field.choices:
        raise _invalid("SPEC_FIELD_INVALID", "Only a list field has choices.", field="choices")
    if data_type not in NUMERIC and (field.min_value is not None or field.max_value is not None):
        raise _invalid(
            "SPEC_FIELD_INVALID", "Only a number has a minimum or a maximum.", field="min_value"
        )
    if (
        field.min_value is not None
        and field.max_value is not None
        and field.min_value > field.max_value
    ):
        raise _invalid("SPEC_FIELD_INVALID", "The minimum is above the maximum.", field="min_value")
    if data_type not in WITH_DECIMALS and field.decimal_places:
        raise _invalid(
            "SPEC_FIELD_INVALID",
            "Only a decimal number or a measure has decimal places.",
            field="decimal_places",
        )
    if data_type not in NUMERIC and field.unit_label:
        raise _invalid("SPEC_FIELD_INVALID", "Only a number has a unit.", field="unit_label")
    if data_type == SpecDataType.MEASURE and not field.unit_label.strip():
        raise _invalid("SPEC_FIELD_INVALID", "A measure needs a unit.", field="unit_label")

@transaction.atomic
def create_field(
    actor,
    *,
    template,
    key,
    label,
    data_type,
    required=False,
    choices=None,
    min_value=None,
    max_value=None,
    decimal_places=0,
    unit_label="",
    help_text="",
    sort_order=0,
):
    """Adds a field to a template. A new required field does not invalidate the items
    that already exist: they are checked the next time their specifications change."""
    policy.require(actor, Code.SPEC_TEMPLATE_MANAGE)
    field = SpecificationField(
        template=template,
        key=key,
        label=label,
        data_type=data_type,
        required=required,
        choices=choices or [],
        min_value=min_value,
        max_value=max_value,
        decimal_places=decimal_places,
        unit_label=unit_label.strip(),
        help_text=help_text,
        sort_order=sort_order,
    )
    _check_definition(field)
    field.save()
    audit.record(
        actor,
        "items.specification_field.created",
        field,
        after=audit.snapshot(field, FIELD_AUDITED),
    )
    return field

@transaction.atomic
def update_field(actor, field, **changes):
    """The key and the kind of value are fixed. Once items hold a value for the field, its
    decimal places are fixed too, and a choice that an item uses cannot be removed."""
    policy.require(actor, Code.SPEC_TEMPLATE_MANAGE)
    field = SpecificationField.objects.select_for_update().get(pk=field.pk)
    before = audit.snapshot(field, FIELD_AUDITED)
    old_choices = list(field.choices)
    if "unit_label" in changes:
        changes["unit_label"] = changes["unit_label"].strip()
    for name, value in changes.items():
        setattr(field, name, value)
    _check_definition(field)
    after = audit.snapshot(field, FIELD_AUDITED)
    if after == before:
        return field
    if after["decimal_places"] != before["decimal_places"] and _items_using(field).exists():
        raise DomainError(
            "SPEC_FIELD_IN_USE",
            "Items already hold a value for this field; its decimal places cannot change.",
            context={"field": "decimal_places"},
        )
    removed = [choice for choice in old_choices if choice not in field.choices]
    used = [choice for choice in removed if _choice_in_use(field, choice)]
    if used:
        raise DomainError(
            "SPEC_FIELD_IN_USE",
            "Items use these choices, so they cannot be removed: " + ", ".join(used) + ".",
            context={"field": "choices", "choices": used},
        )
    field.save()
    audit.record(actor, "items.specification_field.updated", field, before=before, after=after)
    return field

# Values
def _decimal(value, field):
    """A decimal from a string or an integer. Floats are refused: 0.1 is not exact."""
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError('Enter a number, as text such as "2.5".')
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        raise ValueError("Enter a number.") from None
    if not number.is_finite():
        raise ValueError("Enter a number.")
    places = field.decimal_places if field.data_type in WITH_DECIMALS else 0
    if number != number.quantize(Decimal(1).scaleb(-places)):
        if places == 0:
            raise ValueError("Enter a whole number.")
        raise ValueError(f"Use at most {places} decimal place(s).")
    return number

def _check_range(number, field):
    if field.min_value is not None and number < field.min_value:
        raise ValueError(f"The minimum is {field.min_value.normalize():f}.")
    if field.max_value is not None and number > field.max_value:
        raise ValueError(f"The maximum is {field.max_value.normalize():f}.")

def _clean_value(field, value):
    """The stored form of one value, or ValueError with the message for the user."""
    data_type = field.data_type
    if data_type == SpecDataType.TEXT:
        if not isinstance(value, str):
            raise ValueError("Enter text.")
        value = value.strip()
        if len(value) > TEXT_MAX_LENGTH:
            raise ValueError(f"Use at most {TEXT_MAX_LENGTH} characters.")
        return value
    if data_type == SpecDataType.BOOLEAN:
        if not isinstance(value, bool):
            raise ValueError("Enter yes or no.")
        return value
    if data_type == SpecDataType.INTEGER:
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            raise ValueError("Enter a whole number.")
        number = _decimal(value, field)
        _check_range(number, field)
        return int(number)
    if data_type in WITH_DECIMALS:
        number = _decimal(value, field)
        _check_range(number, field)
        return f"{number.quantize(Decimal(1).scaleb(-field.decimal_places)):f}"
    if data_type == SpecDataType.CHOICE:
        if value not in field.choices:
            raise ValueError("Choose one of the listed values.")
        return value
    # MULTI_CHOICE: distinct listed values, kept in the order of the choices.
    if not isinstance(value, list) or not all(isinstance(entry, str) for entry in value):
        raise ValueError("Choose from the listed values.")
    unknown = [entry for entry in value if entry not in field.choices]
    if unknown:
        raise ValueError("Not a listed value: " + ", ".join(unknown) + ".")
    return [choice for choice in field.choices if choice in value]

def _is_empty(value):
    return value is None or value == "" or value == []


def clean(category, values, *, previous=None, same_template=True):
    """The specifications to store for an item of `category`, from `values`."""
    if not isinstance(values, dict):
        raise _invalid("SPEC_INVALID", "Specifications must be an object.", fields={})
    template = category.specification_template
    if template is None:
        if any(not _is_empty(value) for value in values.values()):
            raise _invalid(
                "SPEC_INVALID",
                "This item's category has no specification template.",
                fields={key: "The category has no specifications." for key in values},
            )
        return {}

    fields = {field.key: field for field in template.fields.all()}
    errors, cleaned = {}, {}
    for key, value in values.items():
        field = fields.get(key)
        if field is None:
            errors[key] = "Not a specification of this category."
        elif not field.is_active:
            if previous is None or value != previous.get(key):
                errors[key] = "This specification is no longer in use."
        elif not _is_empty(value):
            try:
                cleaned[key] = _clean_value(field, value)
            except ValueError as exc:
                errors[key] = str(exc)
            else:
                if field.data_type == SpecDataType.TEXT and cleaned[key] == "":
                    del cleaned[key]
    for key, field in fields.items():
        if field.is_active and field.required and key not in cleaned and key not in errors:
            errors[key] = "This specification is required."
    if errors:
        raise _invalid(
            "SPEC_INVALID",
            "Some specifications are not valid.",
            fields=dict(sorted(errors.items())),
        )
    if previous and same_template:
        for key, field in fields.items():
            if not field.is_active and key in previous:
                cleaned[key] = previous[key]
    return dict(sorted(cleaned.items()))
