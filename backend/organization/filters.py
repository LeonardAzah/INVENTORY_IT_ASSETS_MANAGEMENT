import django_filters

from core.api.filters import StrictFilterSet

from .models import Department, Location, Office, Region

class RegionFilter(StrictFilterSet):
    class Meta:
        model = Region
        fields = ["is_active"]

class OfficeFilter(StrictFilterSet):
    town = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = Office
        fields = ["region", "parent", "kind", "town", "is_active"]

class DepartmentFilter(StrictFilterSet):
    class Meta:
        model = Department
        fields = ["region", "office", "kind", "is_active"]

class LocationFilter(StrictFilterSet):
    class Meta:
        model = Location
        fields = ["region", "office", "department", "is_active"]
