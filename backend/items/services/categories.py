from django.core.exceptions import PermissionDenied
from django.db import transaction

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..models import Category
from . import access

AUDITED = ("name", "warehouse_type", "is_predefined", "is_active", "specification_template")

def _require_admin(actor):
    if not policy.context_for(actor).administers_organization:
        raise PermissionDenied

def _check_template(template):
    if template is not None and not template.is_active:
        raise DomainError(
            "INACTIVE_REFERENCE", "The specification template is inactive.", status_code=400
        )

@transaction.atomic
def create_category(
    actor, *, name, warehouse_type, is_predefined=False, specification_template=None
):
    category = Category(
        name=name,
        warehouse_type=warehouse_type,
        is_predefined=is_predefined,
        specification_template=specification_template,
        created_by=actor,
    )
    access.require(actor, Code.CATEGORY_MANAGE, category)
    if is_predefined:
        _require_admin(actor)
    _check_template(specification_template)
    category.save()
    audit.record(actor, "items.category.created", category, after=audit.snapshot(category, AUDITED))
    return category

@transaction.atomic
def update_category(actor, category, **changes):
    """The type is fixed. Predefined categories, and the
    predefined flag itself, are for Administrators. The template can change only while
    no item of the category holds specifications, so no value is left without its
    definition."""
    access.require(actor, Code.CATEGORY_MANAGE, category)
    category = Category.objects.select_for_update().get(pk=category.pk)
    if category.is_predefined or "is_predefined" in changes:
        _require_admin(actor)
    before = audit.snapshot(category, AUDITED)
    for name, value in changes.items():
        setattr(category, name, value)
    after = audit.snapshot(category, AUDITED)
    if after == before:
        return category
    if after["specification_template"] != before["specification_template"]:
        _check_template(category.specification_template)
        if category.items.exclude(specifications={}).exists():
            raise DomainError(
                "CATEGORY_TEMPLATE_IN_USE",
                "Items of this category hold specifications; clear them before changing "
                "the template.",
            )
    category.save()
    audit.record(actor, "items.category.updated", category, before=before, after=after)
    return category