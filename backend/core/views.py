from django.db import connection

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework import serializers

from .api.responses import api_response
from .api.views import BaseAPIView

class HealthOutput(serializers.Serializer):
    status = serializers.CharField()
    database = serializers.CharField()

class HealthView(BaseAPIView):
    """Liveness probe: confirms the API is up and can reach the databse."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(responses=HealthOutput)
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return api_response({"status": "ok", "database":"ok"}, message="Service is healthy.")