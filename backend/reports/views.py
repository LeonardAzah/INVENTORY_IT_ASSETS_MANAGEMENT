from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from accounts import policy
from accounts.policy import Code
from audit.models import AuditLog
from core.api.exceptions import InvalidQueryParameters
from core.api.filters import QueryParamValidator
from core.api.pagination import EnvelopePagination
from core.api.responses import api_response
from core.api.views import BaseAPIView, GenericListViewAPI
from core.exceptions import DomainError
from notifications.models import Notification

from . import dashboard, filters, pdf, serializers
from .definitions import REPORTS
from .services import oversight

FORMATS = ("json", "pdf")

def _describe(report):
    return {
        "name": report.name,
        "title": report.title,
        "description": report.description,
        "columns": [{"key": key, "label": label} for key, label in report.columns],
        "filters": sorted(report.filterset.get_filters()),
        "formats": list(FORMATS),
    }

class ReportListView(BaseAPIView):
    """The reports the caller may run."""

    @extend_schema(operation_id="reports_list", responses=serializers.ReportDescription(many=True))
    def get(self, request):
        codes = policy.codes_for(request.user)
        return api_response([_describe(r) for r in REPORTS.values() if r.code in codes])

class ReportView(BaseAPIView):
    """`GET reports/{name}/?format=json|pdf&<filters>`. Rows are limited to the caller's
    scope before any filter is applied. A PDF error still comes back as JSON."""

    extra_query_params = ("format",)
    search_fields = ()
    ordering_fields = ()
    paginator = EnvelopePagination()

    @extend_schema(
        operation_id="reports_run",
        parameters=[
            OpenApiParameter("format", str, enum=list(FORMATS), default="json"),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={
            (200, "application/json"): serializers.ReportOutput,
            (200, "application/pdf"): OpenApiTypes.BINARY,
        },
        description=(
            "Runs one report. Each report also takes the filters listed in its `filters` "
            "(see `GET reports/`); any other query parameter is refused with 400."
        ),
    )
    def get(self, request, name):
        report = REPORTS.get(name)
        if report is None:
            raise Http404
        policy.require_code(request.user, report.code)
        self.filterset_class = report.filterset
        QueryParamValidator().filter_queryset(request, None, self)

        output = request.query_params.get("format", "json")
        if output not in FORMATS:
            raise InvalidQueryParameters({"format": ["Choose json or pdf."]})
        filterset = report.filterset(request.query_params, queryset=report.queryset(request.user))
        if not filterset.is_valid():
            raise InvalidQueryParameters(filterset.errors)
        queryset = filterset.qs.order_by(*report.ordering)

        if output == "pdf":
            return self._pdf(request, report, queryset)
        paginator = EnvelopePagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        body = paginator.get_paginated_response([report.row(obj) for obj in page]).data
        return Response({**_describe(report), **body})

    def _pdf(self, request, report, queryset):
        count = queryset.count()
        if count > pdf.MAX_ROWS:
            raise DomainError(
                "TOO_MANY_ROWS",
                f"This report has {count} rows; a PDF holds at most {pdf.MAX_ROWS}. "
                "Narrow the filters.",
                context={"rows": count, "limit": pdf.MAX_ROWS},
                status_code=400,
            )
        used = {
            key: value
            for key, value in request.query_params.items()
            if key != "format" and value != ""
        }
        content = pdf.render(
            report,
            [report.row(obj) for obj in queryset],
            generated_by=request.user.email,
            filters_text=", ".join(f"{k}={v}" for k, v in sorted(used.items())) or "none",
        )
        response = HttpResponse(content, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{report.name}.pdf"'
        return response

class DashboardView(BaseAPIView):
    @extend_schema(responses=serializers.DashboardOutput)
    def get(self, request):
        return api_response(dashboard.build(request.user))


# Oversight. These live here, not in the audit and notifications apps, because those
# apps sit below the policy engine and cannot check who is asking.
class AuditListView(GenericListViewAPI):
    filterset_class = filters.AuditFilter
    search_fields = ("object_repr",)
    ordering_fields = ("occurred_at",)
    ordering = ("-occurred_at", "-id")
    output_serializer_class = serializers.AuditOutput

    def get_queryset(self):
        policy.require(self.request.user, Code.AUDIT_VIEW)
        return AuditLog.objects.select_related("actor")

class NotificationListView(GenericListViewAPI):
    filterset_class = filters.NotificationFilter
    search_fields = ("recipient_email",)
    ordering_fields = ("created_at",)
    ordering = ("-created_at", "-id")
    output_serializer_class = serializers.NotificationOutput

    def get_queryset(self):
        policy.require(self.request.user, Code.AUDIT_VIEW)
        return Notification.objects.all()

class NotificationRetryView(BaseAPIView):
    @extend_schema(request=None, responses=serializers.NotificationOutput)
    def post(self, request, pk):
        policy.require(request.user, Code.AUDIT_VIEW)
        notification = get_object_or_404(Notification, pk=pk)
        oversight.retry_notification(request.user, notification)
        notification.refresh_from_db()
        return api_response(
            serializers.NotificationOutput(notification).data, message="Email queued again."
        )
