from django.urls import path

from . import views

urlpatterns = [
    path("units/", views.UnitListCreateView.as_view(), name="unit-list"),
    path("units/<uuid:pk>/", views.UnitDetailView.as_view(), name="unit-detail"),
    path("categories/", views.CategoryListCreateView.as_view(), name="category-list"),
    path("categories/<uuid:pk>/", views.CategoryDetailView.as_view(), name="category-detail"),
    path("items/", views.ItemListCreateView.as_view(), name="item-list"),
    path("items/<uuid:pk>/", views.ItemDetailView.as_view(), name="item-detail"),
    path(
        "specification-templates/",
        views.SpecificationTemplateListCreateView.as_view(),
        name="specification-template-list",
    ),
    path(
        "specification-templates/<uuid:pk>/",
        views.SpecificationTemplateDetailView.as_view(),
        name="specification-template-detail",
    ),
    path(
        "specification-templates/<uuid:pk>/fields/",
        views.SpecificationFieldListCreateView.as_view(),
        name="specification-field-list",
    ),
    path(
        "specification-templates/<uuid:pk>/fields/<uuid:field_id>/",
        views.SpecificationFieldDetailView.as_view(),
        name="specification-field-detail",
    ),
]
