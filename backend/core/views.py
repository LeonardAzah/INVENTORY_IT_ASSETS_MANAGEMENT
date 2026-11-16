from django.db import connection
from rest_framework.permissions import AllowAny

from .api.responses import api_response
from .api.views import BaseAPIView

class HealthView(BaseAPIView):
    """Liveness probe: confirms the API is up and can reach the databse."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return api_response({"status": "ok", "database":"ok"}, message="Service is healthy.")