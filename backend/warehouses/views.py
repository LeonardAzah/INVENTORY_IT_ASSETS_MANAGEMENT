from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status as http

from accounts import policy
from core.api.responses import api_response
from core.api.views import (
    BaseAPIView,
    GenericListCreateViewAPI,
    GenericListViewAPI,
    GenericRetrieveUpdateViewAPI,
)
from organization.selectors import regions_for

from . import filters, selectors, serializers
from .services import store_keepers, warehouses

class RegionITStaffView(BaseAPIView):
    """The Chief of Service of Computing, the IT Asset Manager and the IT warehouse of a
    region, with vacancies.
    For Administrators and for the region's own IT staff."""

    def get(self, request, pk):
        region = get_object_or_404(regions_for(request.user), pk=pk)
        context = policy.context_for(request.user)
        if not context.administers_organization and region.pk not in context.it_regions:
            raise Http404
        return api_response(serializers.ITStaffOutput(selectors.it_staff(region)).data)

class WarehouseListCreateView(GenericListCreateViewAPI):
    selector = selectors.warehouses_for
    filterset_class = filters.WarehouseFilter
    search_fields = ("code", "name")
    ordering_fields = ("code", "name")
    ordering = ("code",)
    input_serializer_class = serializers.WarehouseCreateInput
    output_serializer_class = serializers.WarehouseOutput
    create_service = warehouses.create_warehouse
    success_messages = {"POST": "Warehouse created successfully."}

class WarehouseDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.warehouses_for
    input_serializer_class = serializers.WarehouseUpdateInput
    output_serializer_class = serializers.WarehouseOutput
    update_service = warehouses.update_warehouse
    success_messages = {"PATCH": "Warehouse updated successfully."}

class _WarehouseScoped:
    """The warehouse named in the URL, if the caller may see it; otherwise 404."""
    def get_warehouse(self):
        return get_object_or_404(selectors.warehouses_for(self.request.user), pk=self.kwargs["pk"])

class StoreKeeperView(_WarehouseScoped, BaseAPIView):
    def post(self, request, pk):
        warehouse = self.get_warehouse()
        serializer = serializers.StoreKeeperInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        store_keepers.assign(request.user, warehouse, **serializer.validated_data)
        # Read again: the assignment that was prefetched before the change is stale.
        return api_response(
            serializers.WarehouseOutput(self.get_warehouse()).data,
            message="Store Keeper assigned successfully.",
            status=http.HTTP_201_CREATED,
        )

    def delete(self, request, pk):
        warehouse = self.get_warehouse()
        serializer = serializers.ReasonInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        store_keepers.remove(request.user, warehouse, **serializer.validated_data)
        return api_response(None, message="Store Keeper removed. The warehouse is vacant.")

class WarehouseAssignmentListView(_WarehouseScoped, GenericListViewAPI):
    filterset_class = filters.AssignmentFilter
    search_fields = (
        "user__email",
        "user__profile__employee__first_name",
        "user__profile__employee__last_name",
    )
    ordering_fields = ("assigned_at",)
    ordering = ("-assigned_at",)
    output_serializer_class = serializers.AssignmentOutput

    def get_queryset(self):
        return selectors.assignments_of(self.get_warehouse())
