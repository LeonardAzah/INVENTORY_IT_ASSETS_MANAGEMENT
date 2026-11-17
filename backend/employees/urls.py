from django.urls import path

from . import views

urlpatterns = [
    path("employees/", views.EmployeeListCreateView.as_view(), name="employee-list"),
    path("employees/<uuid:pk>/", views.EmployeeDetailView.as_view(), name="employee-detail"),
    path(
        "employees/<uuid:pk>/deactivate/",
        views.EmployeeDeactivateView.as_view(),
        name="employee-deactivate",
    ),
    path(
        "employees/<uuid:pk>/reactivate/",
        views.EmployeeReactivateView.as_view(),
        name="employee-reactivate",
    ),
]
