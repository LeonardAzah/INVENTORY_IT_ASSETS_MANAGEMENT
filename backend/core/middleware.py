import uuid
from contextvars import ContextVar

_request_id = ContextVar("request_id", default=None)
_client_ip = ContextVar("clinet_ip", default=None)

def get_request_id():
    """The current request's id."""
    return _request_id.get()

def get_client_ip():
    """The current request's remote address."""
    return _client_ip.get()

class RequestIdMiddleware:
    """Gives each request a UUID, exposed as `request.request_id` and `X-Request-ID`.'"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = uuid.uuid4()
        id_token = _request_id.set(request.request_id)
        ip_token = _client_ip.set(request.META.get("REMOTE_ADDR") or None)
        try:
            response = self.get_response(request)
        finally:
            _request_id.reset(id_token)
            _client_ip.reset(ip_token)
        response["X-Request-ID"] = str(request.request_id)
        return response