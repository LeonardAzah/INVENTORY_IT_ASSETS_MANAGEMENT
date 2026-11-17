from core.api.views import GenericListCreateViewAPI, GenericRetrieveUpdateViewAPI

from . import filters, selectors, serializers
from .services import departments, locations, offices, regions

class RegionListCreateView(GenericListCreateViewAPI):
    selector = selectors.regions_for
    filterset_class = filters.RegionFilter
    search_fields = ("code", "name")
    ordering_fields = ("code", "name")
    ordering = ("code",)
    input_serializer_class = serializers.RegionCreateInput
    output_serializer_class = serializers.RegionOutput
    create_service = regions.create_region
    success_messages = {"POST": "Region created successfully."}

class RegionDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.regions_for
    input_serializer_class = serializers.RegionUpdateInput
    output_serializer_class = serializers.RegionOutput
    update_service = regions.update_region
    success_messages = {"PATCH": "Region updated successfully."}

class OfficeListCreateView(GenericListCreateViewAPI):
    selector = selectors.offices_for
    filterset_class = filters.OfficeFilter
    search_fields = ("code", "name", "town")
    ordering_fields = ("code", "name")
    ordering = ("name", "code")
    input_serializer_class = serializers.OfficeCreateInput
    output_serializer_class = serializers.OfficeOutput
    create_service = offices.create_office
    success_messages = {"POST": "Office created successfully."}

class OfficeDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.offices_for
    input_serializer_class = serializers.OfficeUpdateInput
    output_serializer_class = serializers.OfficeOutput
    update_service = offices.update_office
    success_messages = {"PATCH": "Office updated successfully."}

class DepartmentListCreateView(GenericListCreateViewAPI):
    selector = selectors.departments_for
    filterset_class = filters.DepartmentFilter
    search_fields = ("code", "name")
    ordering_fields = ("code", "name")
    ordering = ("name", "code")
    input_serializer_class = serializers.DepartmentCreateInput
    output_serializer_class = serializers.DepartmentOutput
    create_service = departments.create_department
    success_messages = {"POST": "Department created successfully."}

class DepartmentDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.departments_for
    input_serializer_class = serializers.DepartmentUpdateInput
    output_serializer_class = serializers.DepartmentOutput
    update_service = departments.update_department
    success_messages = {"PATCH": "Department updated successfully."}

class LocationListCreateView(GenericListCreateViewAPI):
    selector = selectors.locations_for
    filterset_class = filters.LocationFilter
    search_fields = ("name",)
    ordering_fields = ("name",)
    ordering = ("name", "id")
    input_serializer_class = serializers.LocationCreateInput
    output_serializer_class = serializers.LocationOutput
    create_service = locations.create_location
    success_messages = {"POST": "Location created successfully."}

class LocationDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.locations_for
    input_serializer_class = serializers.LocationUpdateInput
    output_serializer_class = serializers.LocationOutput
    update_service = locations.update_location
    success_messages = {"PATCH": "Location updated successfully."}
