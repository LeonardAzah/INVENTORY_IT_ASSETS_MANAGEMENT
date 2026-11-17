from django.urls import path

from . import views

urlpatterns = [
    path("regions/", views.RegionListCreateView.as_view(), name="region-list"),
    path("regions/<uuid:pk>/", views.RegionDetailView.as_view(), name="region-detail"),
    path("offices/", views.OfficeListCreateView.as_view(), name="office-list"),
    path("offices/<uuid:pk>/", views.OfficeDetailView.as_view(), name="office-detail"),
    path("departments/", views.DepartmentListCreateView.as_view(), name="department-list"),
    path("departments/<uuid:pk>/", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("locations/", views.LocationListCreateView.as_view(), name="location-list"),
    path("locations/<uuid:pk>/", views.LocationDetailView.as_view(), name="location-detail"),
]
