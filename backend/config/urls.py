from django.conf import settings

from django.urls import path, include, re_path

from core.api import errors

urlpatterns = [
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("organization.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("warehouses.urls")),
    path("api/v1/", include("employees.urls")),
    path("api/v1/", include("items.urls")),
    path("api/v1/", include("inventory.urls")),
]

# if settings.API_DOCS_ENABLED:
    # The OpenAPI schema and Swagger UI: dev and test only (prod leaves them off).
urlpatterns.append(path("api/v1/", include("core.schema_urls")))

# Last: any other /api/ path gets the JSON envelope, also when DEBUG is on.
urlpatterns.append(re_path(r"^api/", errors.api_not_found))

handler404 = errors.handler404
handler500 = errors.handler500