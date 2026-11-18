from django.urls import path, include, re_path

from core.api import errors

urlpatterns = [
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("organization.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("warehouses.urls")),
    path("api/v1/", include("employees.urls")),
    path("api/v1/", include("items.urls")),
    re_path(r"^api/", errors.api_not_found),
]

handler404 = errors.handler404
handler500 = errors.handler500