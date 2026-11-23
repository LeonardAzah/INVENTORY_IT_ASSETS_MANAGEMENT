from django.urls import path

from . import views

asset = "assets/<uuid:pk>/"

urlpatterns = [
    path("assets/", views.AssetListCreateView.as_view(), name="asset-list"),
    path("assets/bulk/", views.BulkRegisterView.as_view(), name="asset-bulk-register"),
    path("assets/discover/", views.DiscoverView.as_view(), name="asset-discover"),
    path(
        "assets/pending-registration/",
        views.PendingRegistrationView.as_view(),
        name="asset-pending-registration",
    ),
    path(
        "assets/acquisitions/", views.AcquisitionListCreateView.as_view(), name="acquisition-list"
    ),
    path(
        "assets/acquisitions/<uuid:pk>/",
        views.AcquisitionDetailView.as_view(),
        name="acquisition-detail",
    ),
    path(asset, views.AssetDetailView.as_view(), name="asset-detail"),
    path(f"{asset}assign/", views.AssignView.as_view(), name="asset-assign"),
    path(f"{asset}return/", views.ReturnView.as_view(), name="asset-return"),
    path(f"{asset}location/", views.RelocateView.as_view(), name="asset-relocate"),
    path(f"{asset}status/", views.StatusView.as_view(), name="asset-status"),
    path(f"{asset}found/", views.FoundView.as_view(), name="asset-found"),
    path(f"{asset}history/", views.AssetHistoryView.as_view(), name="asset-history"),
    path(
        f"{asset}relationships/",
        views.RelationshipListCreateView.as_view(),
        name="asset-relationship-list",
    ),
    path(
        f"{asset}relationships/<uuid:relationship_id>/",
        views.RelationshipDetailView.as_view(),
        name="asset-relationship-detail",
    ),
    path("employees/<uuid:pk>/assets/", views.EmployeeAssetsView.as_view(), name="employee-assets"),
]
