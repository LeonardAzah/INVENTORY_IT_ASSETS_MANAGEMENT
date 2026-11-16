from django import forms
from django.db import models
from django_filters import Filter
from django_filters.rest_framework import DjangoFilterBackend, FilterSet
from rest_framework.exceptions import ValidationError
from rest_framework.filters import BaseFilterBackend, OrderingFilter

from .exceptions import InvalidQueryParameters

def _ordering_errors(terms):
    return [f"Ordering by '{term.lstrip('-')}' is not allowed." for term in terms]

class StrictOrderingFilter(OrderingFilter):
    """Ordering by a field outside the view's `ordering_fields` is a 400, not ignored."""

    def invalid_terms(self, request, queryset, view):
        params = request.query_params.get(self.ordering_param)
        if not params:
            return []
        terms = [term.strip() for term in params.split(",")]
        valid = super().remove_invalid_fields(queryset, terms, view, request)
        return [term for term in terms if term not in valid]

    def remove_invalid_fields(self, queryset, fields, view, request):
        valid = super().remove_invalid_fields(queryset, fields, view, request)
        invalid = [term for term in fields if term not in valid]
        if invalid:
            raise InvalidQueryParameters({self.ordering_param: _ordering_errors(invalid)})
        return valid

class QueryParamValidator(BaseFilterBackend):
    """Rejects any query key the view has not declared. Runs before the other backends."""

    def allowed_params(self, view):
        allowed = set(getattr(view, "extra_query_params", ()))
        filterset_class = getattr(view, "filterset_class", None)
        if filterset_class is not None:
            allowed.update(filterset_class.get_filters())
        if getattr(view, "search_fields", None):
            allowed.add("search")
        if getattr(view, "ordering_fields", None):
            allowed.add("ordering")
        paginator = getattr(view, "paginator", None)
        if paginator is not None:
            allowed.add(paginator.page_query_param)
            if paginator.page_size_query_param:
                allowed.add(paginator.page_size_query_param)
        return allowed

    def filter_queryset(self, request, queryset, view):
        allowed = self.allowed_params(view)
        errors = {
            key: ["Unknown query parameter."] for key in request.query_params if key not in allowed
        }
        if "ordering" in allowed:
            invalid = StrictOrderingFilter().invalid_terms(request, queryset, view)
            if invalid:
                errors["ordering"] = _ordering_errors(invalid)
        if errors:
            raise InvalidQueryParameters(errors)
        return queryset

class StrictDjangoFilterBackend(DjangoFilterBackend):
    """django-filter, with invalid filter values reported as invalid query parameters."""

    def filter_queryset(self, request, queryset, view):
        try:
            return super().filter_queryset(request, queryset, view)
        except ValidationError as exc:
            raise InvalidQueryParameters(exc.detail) from None

class StrictBooleanField(forms.Field):
    def to_python(self, value):
        if value in self.empty_values:
            return None
        normalized = str(value).strip().lower()
        if normalized in ("true", "1"):
            return True
        if normalized in ("false", "0"):
            return False
        raise forms.ValidationError("Enter 'true' or 'false'.")

class StrictBooleanFilter(Filter):
    """Boolean filter that rejects anything but true/false; django-filter's ignores it."""

    field_class = StrictBooleanField

class StrictFilterSet(FilterSet):
    """Base for every FilterSet in the apps' `filters.py`."""

    FILTER_DEFAULTS = {
        **FilterSet.FILTER_DEFAULTS,
        models.BooleanField: {"filter_class": StrictBooleanFilter},
    }