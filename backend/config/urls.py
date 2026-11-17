from django.urls import path, include, re_path

from core.api import errors

urlpatterns = [
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("organization.urls")),
    re_path(r"^api/", errors.api_not_found),
]
