from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny

class SchemaView(SpectacularAPIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

class SchemaDocsView(SpectacularSwaggerView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

urlpatterns = [
    path("schema/", SchemaView.as_view(), name="schema"),
    path("schema/docs/", SchemaDocsView.as_view(url_name="schema"), name="schema-docs"),
]
