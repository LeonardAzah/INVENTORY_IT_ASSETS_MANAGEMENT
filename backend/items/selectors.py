"""The catalogue is organization-wide reference data: every authenticated user reads it."""

from .models import Category, Item, SpecificationField, SpecificationTemplate, UnitOfMeasure

def units_for(user):
    return UnitOfMeasure.objects.all()

def categories_for(user):
    return Category.objects.select_related("specification_template")

def items_for(user):
    return Item.objects.select_related("category", "unit")

def templates_for(user):
    return SpecificationTemplate.objects.prefetch_related("fields")

def fields_of(template):
    return SpecificationField.objects.filter(template=template)
