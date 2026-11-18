from django.urls import path

from . import views

urlpatterns = [
    path("regions/<uuid:pk>/it-staff/", views.RegionITStaffView.as_view(), name="region-it-staff"),
    path("warehouses/", views.WarehouseListCreateView.as_view(), name="warehouse-list"),
    path("warehouses/<uuid:pk>/", views.WarehouseDetailView.as_view(), name="warehouse-detail"),
    path(
        "warehouses/<uuid:pk>/store-keeper/",
        views.StoreKeeperView.as_view(),
        name="warehouse-store-keeper",
    ),
    path(
        "warehouses/<uuid:pk>/assignments/",
        views.WarehouseAssignmentListView.as_view(),
        name="warehouse-assignment-list",
    ),
]
