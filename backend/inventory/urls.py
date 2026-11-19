from django.urls import path

from . import views

urlpatterns = [
    path("inventory/", views.BalanceListView.as_view(), name="balance-list"),
    path("inventory/transactions/", views.TransactionListView.as_view(), name="transaction-list"),
    path("inventory/thresholds/", views.ThresholdView.as_view(), name="threshold"),
    path("inventory/units/", views.UnitListView.as_view(), name="unit-list"),
    path("inventory/units/<uuid:pk>/", views.UnitDetailView.as_view(), name="unit-detail"),
    path("inventory/receipts/", views.ReceiptListCreateView.as_view(), name="receipt-list"),
    path("inventory/receipts/<uuid:pk>/", views.ReceiptDetailView.as_view(), name="receipt-detail"),
    path("inventory/issues/", views.IssueListCreateView.as_view(), name="issue-list"),
    path(
        "inventory/issues/recipient-stores/",
        views.RecipientStoresView.as_view(),
        name="issue-recipient-stores",
    ),
    path("inventory/issues/<uuid:pk>/", views.IssueDetailView.as_view(), name="issue-detail"),
    path("inventory/returns/", views.ReturnListCreateView.as_view(), name="return-list"),
    path("inventory/returns/<uuid:pk>/", views.ReturnDetailView.as_view(), name="return-detail"),
    path(
        "inventory/adjustments/", views.AdjustmentListCreateView.as_view(), name="adjustment-list"
    ),
    path(
        "inventory/adjustments/<uuid:pk>/",
        views.AdjustmentDetailView.as_view(),
        name="adjustment-detail",
    ),
    path("inventory/stock-takes/", views.StockTakeListCreateView.as_view(), name="stock-take-list"),
    path(
        "inventory/stock-takes/<uuid:pk>/",
        views.StockTakeDetailView.as_view(),
        name="stock-take-detail",
    ),
    path(
        "inventory/stock-takes/<uuid:pk>/lines/",
        views.StockTakeLinesView.as_view(),
        name="stock-take-lines",
    ),
    path(
        "inventory/stock-takes/<uuid:pk>/complete/",
        views.StockTakeCompleteView.as_view(),
        name="stock-take-complete",
    ),
    path(
        "inventory/stock-takes/<uuid:pk>/cancel/",
        views.StockTakeCancelView.as_view(),
        name="stock-take-cancel",
    ),
]
