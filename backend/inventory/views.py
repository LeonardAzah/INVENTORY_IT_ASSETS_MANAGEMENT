from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema

from accounts import policy
from accounts.policy import Code
from core.api.responses import api_response
from core.api.serializers import RefSerializer
from core.api.views import (
    BaseAPIView,
    GenericListCreateViewAPI,
    GenericListViewAPI,
    GenericRetrieveUpdateViewAPI,
)
from warehouses.models import Warehouse

from . import filters, selectors, serializers
from .services import adjustments, issues, receipts, returns, stocktakes, thresholds

class BalanceListView(GenericListViewAPI):
    selector = selectors.balances_for
    filterset_class = filters.BalanceFilter
    search_fields = ("item__code", "item__name")
    ordering_fields = ("item__code", "quantity_on_hand", "last_movement_at")
    ordering = ("item__code", "warehouse__code")
    output_serializer_class = serializers.BalanceOutput

class TransactionListView(GenericListViewAPI):
    """The ledger. Read-only: there is no way to change a movement once it is posted."""

    selector = selectors.transactions_for
    filterset_class = filters.TransactionFilter
    search_fields = ("reference",)
    ordering_fields = ("occurred_at",)
    ordering = ("-occurred_at", "-id")
    output_serializer_class = serializers.TransactionOutput

class ThresholdView(BaseAPIView):
    @extend_schema(request=serializers.ThresholdInput, responses=serializers.BalanceOutput)
    def put(self, request):
        serializer = serializers.ThresholdInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        balance = thresholds.set_threshold(request.user, **serializer.validated_data)
        return api_response(
            serializers.BalanceOutput(balance).data, message="Threshold saved successfully."
        )

class ReceiptListCreateView(GenericListCreateViewAPI):
    selector = selectors.receipts_for
    filterset_class = filters.ReceiptFilter
    search_fields = ("reference", "source")
    ordering_fields = ("receipt_date", "reference")
    ordering = ("-receipt_date", "-reference")
    input_serializer_class = serializers.ReceiptInput
    output_serializer_class = serializers.ReceiptOutput
    create_service = receipts.create_receipt
    success_messages = {"POST": "Receipt recorded successfully."}

class ReceiptDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.receipts_for
    output_serializer_class = serializers.ReceiptOutput

class IssueListCreateView(GenericListCreateViewAPI):
    selector = selectors.issues_for
    filterset_class = filters.IssueFilter
    search_fields = (
        "reference",
        "employee__matricule",
        "employee__first_name",
        "employee__last_name",
        "recipient_store__code",
        "recipient_store__name",
    )
    ordering_fields = ("issue_date", "reference")
    ordering = ("-issue_date", "-reference")
    input_serializer_class = serializers.IssueInput
    output_serializer_class = serializers.IssueOutput
    create_service = issues.create_issue
    success_messages = {"POST": "Issue recorded successfully."}

class IssueDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.issues_for
    output_serializer_class = serializers.IssueOutput

class RecipientStoresView(BaseAPIView):
    """`?warehouse=<id>`: the stores that warehouse may issue to (the region's other
    general stores) [REQ 1.1]. For the issue form's picker: a Store Keeper does not see
    those stores otherwise. Only to whoever may issue from the warehouse; code and name
    only."""

    @extend_schema(
        parameters=[serializers.RecipientStoresQuery], responses=RefSerializer(many=True)
    )
    def get(self, request):
        query = serializers.RecipientStoresQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        warehouse = get_object_or_404(Warehouse, pk=query.validated_data["warehouse"])
        policy.require(request.user, Code.INVENTORY_ISSUE, warehouse)
        return api_response(RefSerializer(issues.recipient_stores(warehouse), many=True).data)

class ReturnListCreateView(GenericListCreateViewAPI):
    selector = selectors.returns_for
    filterset_class = filters.ReturnFilter
    search_fields = ("reference",)
    ordering_fields = ("return_date",)
    ordering = ("-return_date", "-reference")
    input_serializer_class = serializers.ReturnInput
    output_serializer_class = serializers.ReturnOutput
    create_service = returns.create_return
    success_messages = {"POST": "Return recorded successfully."}

class ReturnDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.returns_for
    output_serializer_class = serializers.ReturnOutput

class AdjustmentListCreateView(GenericListCreateViewAPI):
    selector = selectors.adjustments_for
    filterset_class = filters.AdjustmentFilter
    search_fields = ("reference", "reason")
    ordering_fields = ("created_at",)
    ordering = ("-created_at", "-reference")
    input_serializer_class = serializers.AdjustmentInput
    output_serializer_class = serializers.AdjustmentOutput
    create_service = adjustments.create
    success_messages = {"POST": "Adjustment recorded successfully."}

class AdjustmentDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.adjustments_for
    output_serializer_class = serializers.AdjustmentOutput

class StockTakeListCreateView(GenericListCreateViewAPI):
    selector = selectors.stock_takes_for
    filterset_class = filters.StockTakeFilter
    search_fields = ("reference",)
    ordering_fields = ("started_at",)
    ordering = ("-started_at", "-reference")
    input_serializer_class = serializers.StockTakeInput
    output_serializer_class = serializers.StockTakeOutput
    create_service = stocktakes.start
    success_messages = {"POST": "Stock-take started."}

class StockTakeDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.stock_takes_for
    output_serializer_class = serializers.StockTakeOutput

class _StockTakeAction(BaseAPIView):
    """An action on a stock-take the caller can see; otherwise 404."""

    input_serializer_class = None
    message = ""

    def get_stock_take(self):
        return get_object_or_404(selectors.stock_takes_for(self.request.user), pk=self.kwargs["pk"])

    def perform(self, stock_take, data):
        raise NotImplementedError

    def handle(self, request):
        stock_take = self.get_stock_take()
        data = {}
        if self.input_serializer_class is not None:
            serializer = self.input_serializer_class(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
        self.perform(stock_take, data)
        return api_response(
            serializers.StockTakeOutput(self.get_stock_take()).data, message=self.message
        )

class StockTakeLinesView(_StockTakeAction):
    input_serializer_class = serializers.CountsInput
    message = "Counts saved."

    @extend_schema(request=serializers.CountsInput, responses=serializers.StockTakeOutput)
    def patch(self, request, pk):
        return self.handle(request)

    def perform(self, stock_take, data):
        stocktakes.record_counts(self.request.user, stock_take, **data)

class StockTakeCompleteView(_StockTakeAction):
    input_serializer_class = serializers.CompleteInput
    message = "Stock-take completed."

    @extend_schema(request=serializers.CompleteInput, responses=serializers.StockTakeOutput)
    def post(self, request, pk):
        return self.handle(request)

    def perform(self, stock_take, data):
        stocktakes.complete(self.request.user, stock_take, **data)

class StockTakeCancelView(_StockTakeAction):
    message = "Stock-take cancelled."

    @extend_schema(request=None, responses=serializers.StockTakeOutput)
    def post(self, request, pk):
        return self.handle(request)

    def perform(self, stock_take, data):
        stocktakes.cancel(self.request.user, stock_take)

class UnitListView(GenericListViewAPI):
    """Units of serialized general items. With `warehouse`, `item` and `status=IN_STOCK`,
    the units an issue may take."""
    selector = selectors.units_for
    filterset_class = filters.UnitFilter
    search_fields = ("serial_number", "serial_normalized", "item__code", "item__name")
    ordering_fields = ("serial_normalized", "updated_at")
    ordering = ("item__code", "serial_normalized")
    output_serializer_class = serializers.UnitOutput

class UnitDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.units_for
    output_serializer_class = serializers.UnitDetailOutput
