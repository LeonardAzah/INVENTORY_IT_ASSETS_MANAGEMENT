import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions
from rest_framework import status as http
from rest_framework.views import set_rollback

from core.exceptions import DomainError
from core.middleware import get_request_id

from .responses import default_message, error_response, unexpected_error_message

logger = logging.getLogger(__name__)

VALIDATION_FAILED = "Validation failed."
INVALID_QUERY_PARAMETERS = "Invalid query parameters."

# constraint name -> (error_code, message). Apps register the constraints they own, so a
# violation that slips past a service check still gets a friendly 409.
_constraint_errors = {}

def register_constraint_error(constraint_name, error_code, message):
    _constraint_errors[constraint_name] = (error_code, message)

class InvalidQueryParameters(exceptions.ValidationError):
    """400 for unknown query keys, disallowed ordering and invalid filter values."""

def _safe_message(exc):
    detail = exc.detail
    if isinstance(detail, dict):
        detail = detail.get("detail")
    if isinstance(detail, str):
        return str(detail)
    return default_message(exc.status_code)

def _api_exception_response(exc):
    headers = {}
    if getattr(exc, "auth_header", None):
        headers["WWW-Authenticate"] = exc.auth_header
    if getattr(exc, "wait", None):
        headers["Retry-After"] = str(int(exc.wait))

    if isinstance(exc, exceptions.ValidationError):
        data = exc.detail
        if isinstance(data, list):
            data = {"non_field_errors": data}
        if isinstance(exc, InvalidQueryParameters):
            message = INVALID_QUERY_PARAMETERS
        else:
            message = VALIDATION_FAILED
        return error_response(message, exc.status_code, data=data, headers=headers)
    return error_response(_safe_message(exc), exc.status_code, headers=headers)

def _constraint_name(exc):
    diag = getattr(exc.__cause__, "diag", None)
    return getattr(diag, "constraint_name", None)

def envelope_exception_handler(exc, context):
    """Turns every exception raised in a DRF view into the response envelope."""
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    set_rollback()

    if isinstance(exc, exceptions.APIException) and exc.status_code < 500:
        return _api_exception_response(exc)

    if isinstance(exc, DomainError):
        data = {"error_code": exc.error_code, "context": exc.context}
        return error_response(exc.message, exc.status_code, data=data)

    if isinstance(exc, IntegrityError):
        known = _constraint_errors.get(_constraint_name(exc))
        if known:
            error_code, message = known
            data = {"error_code": error_code, "context": {}}
            return error_response(message, http.HTTP_409_CONFLICT, data=data)

    request_id = get_request_id()
    logger.error("Unhandled exception (request %s)", request_id, exc_info=exc)
    return error_response(unexpected_error_message(request_id), http.HTTP_500_INTERNAL_SERVER_ERROR)