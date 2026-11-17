from django.core.exceptions import ImproperlyConfigured
from rest_framework import status as http
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.filters import SearchFilter
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.views import APIView

from .filters import QueryParamValidator, StrictDjangoFilterBackend, StrictOrderingFilter
from .mixins import EnvelopeMixin
from .pagination import EnvelopePagination
from .responses import api_response

class BaseAPIView(EnvelopeMixin, APIView):
    """Action endpoints: input serializer -> service -> `api_response`."""

class ScopedQuerysetMixin:
    """Reads go through `selector(user)`, so a view can never reach out-of-scope rows."""

    selector = None

    def get_queryset(self):
        selector = type(self).selector
        if selector is None:
            raise ImproperlyConfigured(f"{type(self).__name__} must define `selector`.")
        return selector(self.request.user)

class ScopedListMixin(EnvelopeMixin, ScopedQuerysetMixin):
    """Shared configuration for a paginated, scoped list: whitelisted filters, search and
    ordering, applied after `get_queryset()` has already scoped the rows. Set `ordering`
    to a deterministic default so pages are stable.
    """

    output_serializer_class = None
    filterset_class = None
    search_fields = ()
    ordering_fields = ()
    ordering = None
    extra_query_params = ()
    pagination_class = EnvelopePagination
    filter_backends = (
        QueryParamValidator,
        StrictDjangoFilterBackend,
        SearchFilter,
        StrictOrderingFilter,
    )

    def get_serializer_class(self):
        return self.output_serializer_class

class GenericListViewAPI(ScopedListMixin, ListAPIView):
    """Paginated, scoped, read-only list (DRF's `ListAPIView`). Scoping happens in
    `get_queryset()`, before any filter backend runs.
    """

class GenericListCreateViewAPI(ScopedListMixin, ListCreateAPIView):
    """List plus POST (DRF's `ListCreateAPIView`). The write is done in `perform_create`
    by `create_service(actor, **validated_data)`, never by `serializer.save()`: services
    own all writes."""

    input_serializer_class = None
    create_service = None

    def get_serializer_class(self):
        if self.request.method == "POST":
            return self.input_serializer_class
        return self.output_serializer_class

    def get_service_kwargs(self):
        """Extra keyword arguments for `create_service`, e.g. the parent named in the URL."""
        return {}

    def perform_create(self, serializer):
        self.created_instance = type(self).create_service(
            self.request.user, **self.get_service_kwargs(), **serializer.validated_data
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.created_instance
        output = self.output_serializer_class(instance, context=self.get_serializer_context())
        if getattr(instance, "replayed", False):
            # The same `client_request_id` again: this is the document made the first
            # time, and nothing new was created (N-4).
            return api_response(output.data, message="This request was already processed.")
        return api_response(
            output.data,
            message=self.get_success_message(request, http.HTTP_201_CREATED),
            status=http.HTTP_201_CREATED,
        )

class GenericRetrieveUpdateViewAPI(EnvelopeMixin, ScopedQuerysetMixin, RetrieveUpdateAPIView):
    """ 
    Detail GET through the scoped selector (out of scope -> 404), and PATCH through
    `update_service(actor, instance, **validated_data)` when one is configured.

    The write is done in `perform_update`, never by `serializer.save()`. PUT (full replace)
    is not offered, so it 405s like an unknown method; a view with no `update_service` is
    read-only and answers 405 to PATCH as well.
    """

    input_serializer_class = None
    output_serializer_class = None
    update_service = None
    # PATCH only: PUT and DELETE are not offered and 405 like any unknown method.
    http_method_names = ["get", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return self.input_serializer_class
        return self.output_serializer_class

    def perform_update(self, serializer):
        self.updated_instance = type(self).update_service(
            self.request.user, serializer.instance, **serializer.validated_data
        )

    def update(self, request, *args, **kwargs):
        if type(self).update_service is None:
            raise MethodNotAllowed(request.method)
        instance = self.get_object()
        serializer = self.input_serializer_class(
            instance, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        output = self.output_serializer_class(
            self.updated_instance, context=self.get_serializer_context()
        )
        return api_response(
            output.data, message=self.get_success_message(request, http.HTTP_200_OK)
        )
