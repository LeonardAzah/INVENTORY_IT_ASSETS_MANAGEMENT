import uuid

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status as http

from accounts import policy
from accounts.policy import Code
from core.api.exceptions import InvalidQueryParameters
from core.api.filters import QueryParamValidator
from core.api.pagination import EnvelopePagination
from core.api.responses import api_response
from core.api.views import (
    BaseAPIView,
    GenericListCreateViewAPI,
    GenericListViewAPI,
    GenericRetrieveUpdateViewAPI,
)
from employees.selectors import employees_for

from . import filters, selectors, serializers
from .services import discovery, lifecycle, registration, relationships

REPLAYED = "This request was already processed."

def _validated(serializer_class, request):
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data

def _asset_response(asset, message, status=http.HTTP_200_OK, **extra):
    """The asset as its detail view shows it, read again after the change."""
    fresh = selectors._base().get(pk=asset.pk)
    if getattr(asset, "replayed", False):
        message, status = REPLAYED, http.HTTP_200_OK
    return api_response(
        {**serializers.AssetOutput(fresh).data, **extra}, message=message, status=status
    )

class AssetListCreateView(GenericListCreateViewAPI):
    """GET lists assets; POST registers one unit against a receipt line or acquisition."""
    selector = selectors.assets_for
    filterset_class = filters.AssetFilter
    search_fields = ("asset_tag", "serial_number", "item__name")
    ordering_fields = ("asset_tag", "status", "registered_at")
    ordering = ("asset_tag",)
    input_serializer_class = serializers.RegisterInput
    output_serializer_class = serializers.AssetOutput
    create_service = registration.register
    success_messages = {"POST": "Asset registered successfully."}

class AssetDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.assets_for
    input_serializer_class = serializers.AssetUpdateInput
    output_serializer_class = serializers.AssetOutput
    update_service = lifecycle.update
    success_messages = {"PATCH": "Asset updated successfully."}

class BulkRegisterView(BaseAPIView):
    @extend_schema(
        request=serializers.BulkRegisterInput,
        responses={
            201: serializers.AssetOutput(many=True),
            200: OpenApiResponse(serializers.AssetOutput(many=True), description=REPLAYED),
        },
    )
    def post(self, request):
        assets = registration.register_bulk(
            request.user, **_validated(serializers.BulkRegisterInput, request)
        )
        fresh = selectors._base().filter(pk__in=[asset.pk for asset in assets])
        replayed = getattr(assets[0], "replayed", False)
        return api_response(
            serializers.AssetOutput(fresh.order_by("asset_tag"), many=True).data,
            message=REPLAYED if replayed else f"{len(assets)} assets registered successfully.",
            status=http.HTTP_200_OK if replayed else http.HTTP_201_CREATED,
        )

class DiscoverView(BaseAPIView):
    @extend_schema(
        request=serializers.DiscoverInput,
        responses={
            201: serializers.AssetOutput,
            200: OpenApiResponse(serializers.AssetOutput, description=REPLAYED),
        },
    )
    def post(self, request):
        asset = discovery.discover(request.user, **_validated(serializers.DiscoverInput, request))
        return _asset_response(
            asset, "Asset registered as a discovery. Verify it next.", http.HTTP_201_CREATED
        )

class AcquisitionListCreateView(GenericListCreateViewAPI):
    selector = selectors.acquisitions_for
    filterset_class = filters.AcquisitionFilter
    search_fields = ("reference", "source")
    ordering_fields = ("acquisition_date",)
    ordering = ("-acquisition_date", "-reference")
    input_serializer_class = serializers.AcquisitionInput
    output_serializer_class = serializers.AcquisitionOutput
    create_service = registration.record_acquisition
    success_messages = {"POST": "Acquisition recorded successfully."}

class AcquisitionDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.acquisitions_for
    output_serializer_class = serializers.AcquisitionOutput

class PendingRegistrationView(BaseAPIView):
    """Receipt lines and acquisitions that still have units without an asset record."""
    extra_query_params = ("region", "item", "source_type")
    filterset_class = None
    search_fields = ()
    ordering_fields = ()
    paginator = EnvelopePagination()
    pagination_class = EnvelopePagination

    @extend_schema(
        parameters=[
            OpenApiParameter("region", OpenApiTypes.UUID),
            OpenApiParameter("item", OpenApiTypes.UUID),
            OpenApiParameter("source_type", str, enum=["RECEIPT", "ALTERNATIVE_ACQUISITION"]),
        ],
        responses=serializers.PendingRegistrationRow(many=True),
    )
    def get(self, request):
        QueryParamValidator().filter_queryset(request, None, self)
        params = request.query_params
        errors = {}
        for name in ("region", "item"):
            try:
                uuid.UUID(params.get(name) or str(uuid.uuid4()))
            except ValueError:
                errors[name] = ["Enter a valid UUID."]
        if params.get("source_type") not in (None, "", "RECEIPT", "ALTERNATIVE_ACQUISITION"):
            errors["source_type"] = ["Choose RECEIPT or ALTERNATIVE_ACQUISITION."]
        if errors:
            raise InvalidQueryParameters(errors)
        lines = selectors.pending_receipt_lines(request.user)
        acquisitions = selectors.pending_acquisitions(request.user)
        if params.get("region"):
            lines = lines.filter(receipt__warehouse__region_id=params["region"])
            acquisitions = acquisitions.filter(region_id=params["region"])
        if params.get("item"):
            lines = lines.filter(item_id=params["item"])
            acquisitions = acquisitions.filter(item_id=params["item"])
        rows = []
        if params.get("source_type") in (None, "", "RECEIPT"):
            rows += [
                {
                    "source_type": "RECEIPT",
                    "receipt_line_id": line.pk,
                    "acquisition_id": None,
                    "reference": line.receipt.reference,
                    "date": line.receipt.receipt_date,
                    "region": _ref(line.receipt.warehouse.region),
                    "item": _ref(line.item),
                    "quantity": int(line.quantity),
                    "registered": int(line.registered_quantity),
                    "remaining": int(line.quantity - line.registered_quantity),
                }
                for line in lines
            ]
        if params.get("source_type") in (None, "", "ALTERNATIVE_ACQUISITION"):
            rows += [
                {
                    "source_type": "ALTERNATIVE_ACQUISITION",
                    "receipt_line_id": None,
                    "acquisition_id": acquisition.pk,
                    "reference": acquisition.reference,
                    "date": acquisition.acquisition_date,
                    "region": _ref(acquisition.region),
                    "item": _ref(acquisition.item),
                    "quantity": acquisition.quantity,
                    "registered": acquisition.registered_quantity,
                    "remaining": acquisition.quantity - acquisition.registered_quantity,
                }
                for acquisition in acquisitions
            ]
        rows.sort(key=lambda row: (row["date"], row["reference"]), reverse=True)
        paginator = EnvelopePagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(page)

def _ref(obj):
    return {"id": obj.pk, "code": obj.code, "name": obj.name}

class _AssetScoped:
    """Gives a view the asset named in the URL, if the caller can see it; otherwise 404."""

    def get_asset(self):
        return get_object_or_404(selectors.assets_for(self.request.user), pk=self.kwargs["pk"])

class AssignView(_AssetScoped, BaseAPIView):
    @extend_schema(request=serializers.AssignInput, responses=serializers.AssignedAssetOutput)
    def post(self, request, pk):
        asset = lifecycle.assign(
            request.user, self.get_asset(), **_validated(serializers.AssignInput, request)
        )
        peripherals = selectors.linked_peripherals(asset)
        return _asset_response(
            asset,
            "Asset assigned successfully.",
            linked_peripherals=serializers.AssetRef(peripherals, many=True).data,
        )

class ReturnView(_AssetScoped, BaseAPIView):
    @extend_schema(request=serializers.ReturnInput, responses=serializers.AssetOutput)
    def post(self, request, pk):
        asset = lifecycle.return_asset(
            request.user, self.get_asset(), **_validated(serializers.ReturnInput, request)
        )
        return _asset_response(asset, "Asset returned. Inspect it before reuse.")

class RelocateView(_AssetScoped, BaseAPIView):
    @extend_schema(request=serializers.RelocateInput, responses=serializers.AssetOutput)
    def post(self, request, pk):
        asset = lifecycle.relocate(
            request.user, self.get_asset(), **_validated(serializers.RelocateInput, request)
        )
        return _asset_response(asset, "Asset relocated successfully.")

class StatusView(_AssetScoped, BaseAPIView):
    @extend_schema(request=serializers.StatusInput, responses=serializers.AssetOutput)
    def post(self, request, pk):
        asset = lifecycle.change_status(
            request.user, self.get_asset(), **_validated(serializers.StatusInput, request)
        )
        return _asset_response(asset, "Asset status updated successfully.")

class FoundView(_AssetScoped, BaseAPIView):
    @extend_schema(request=serializers.FoundInput, responses=serializers.AssetOutput)
    def post(self, request, pk):
        asset = lifecycle.found(
            request.user, self.get_asset(), **_validated(serializers.FoundInput, request)
        )
        return _asset_response(asset, "Asset recorded as found. Verify it next.")

class AssetHistoryView(_AssetScoped, GenericListViewAPI):
    """The asset's timeline, newest first."""

    filterset_class = filters.EventFilter
    ordering_fields = ("occurred_at",)
    ordering = ("-occurred_at", "-id")
    output_serializer_class = serializers.EventOutput

    def get_queryset(self):
        return selectors.events_of(self.get_asset())

class RelationshipListCreateView(_AssetScoped, GenericListCreateViewAPI):
    filterset_class = filters.RelationshipFilter
    ordering_fields = ("created_at",)
    ordering = ("-created_at", "-id")
    input_serializer_class = serializers.RelationshipInput
    output_serializer_class = serializers.RelationshipOutput
    create_service = relationships.add
    success_messages = {"POST": "Relationship created successfully."}

    def get_queryset(self):
        return selectors.relationships_of(self.get_asset())

    def get_service_kwargs(self):
        return {"asset": self.get_asset()}

class RelationshipDetailView(_AssetScoped, BaseAPIView):
    @extend_schema(responses={200: None})
    def delete(self, request, pk, relationship_id):
        relationship = get_object_or_404(
            selectors.relationships_of(self.get_asset()), pk=relationship_id
        )
        relationships.end(request.user, relationship)
        return api_response(None, message="Relationship ended.")

class EmployeeAssetsView(BaseAPIView):
    """The IT equipment an employee currently holds. For IT staff and Administrators."""

    @extend_schema(responses=serializers.EmployeeAssetOutput(many=True))
    def get(self, request, pk):
        policy.require_code(request.user, Code.IT_ASSET_VIEW)
        employee = get_object_or_404(employees_for(request.user), pk=pk)
        context = policy.context_for(request.user)
        assignments = selectors.assignments_of_employee(employee)
        if not context.sees_organization:
            assignments = assignments.filter(asset__region_id__in=context.it_regions)
        return api_response(serializers.EmployeeAssetOutput(assignments, many=True).data)
