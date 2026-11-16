from django.http import JsonResponse
from django.views import defaults

from .responses import DEFAULT_ERROR_MESSAGES, envelope, unexpected_error_message

def _is_api(request):
    return request.path.startswith("/api/")

def api_not_found(request, *args, **kwargs):
    return JsonResponse(envelope(None, False, DEFAULT_ERROR_MESSAGES[404]), status=404)

def handler404(request, exception):
    if _is_api(request):
        return api_not_found(request)
    return defaults.page_not_found(request, exception)

def handler500(request):
    if _is_api(request):
        message = unexpected_error_message(getattr(request, "request_id", None))
        return JsonResponse(envelope(None, False, message), status=500)
    return defaults.server_error(request)
