from rest_framework import status as http

from .responses import default_message, envelope

class EnvelopeMixin:
    """Guarantees the `{data, success, message}` envelope on every response of the view.

    Responses built with `api_response` or by the exception handler pass through. Anything
    else (generic DRF views, pagination, Djoser, SimpleJWT) is wrapped here. 204 becomes
    200 with `data: null`.
    """
    # Per-method override of the default success message, e.g. {"POST": "Receipt recorded."}
    success_messages = {}

    def get_success_message(self, request, status):
        return self.success_messages.get(request.method) or default_message(status)

    def finalize_response(self, request, response, *args, **kwargs):
        if hasattr(response, "data") and not getattr(response, "is_enveloped", False):
            if response.status_code == http.HTTP_204_NO_CONTENT:
                response.status_code = http.HTTP_200_OK
                response.data = None
            success = response.status_code < 400
            if success:
                message = self.get_success_message(request, response.status_code)
            else:
                message = default_message(response.status_code)
            response.data = envelope(response.data, success, message)
            response.is_enveloped = True
        return super().finalize_response(request, response, *args, **kwargs)
