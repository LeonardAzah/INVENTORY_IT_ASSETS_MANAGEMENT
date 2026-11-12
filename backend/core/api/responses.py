from rest_framework import status as http
from rest_framework.response import Response

DEFAULT_SUCCESS_MESSAGE = "Request completed successfully."
DEFAULT_CREATED_MESSAGE = "Created successfully."

DEFAULT_ERROR_MESSAGES = {
    400: "Validation failed.",
    401: "Authentication credentials were not provided or are invalid.",
    403: "You do not have permission to perform this action.",
    404: "Resource not found.",
    405: "Method not allowed.",
    409: "The request conflicts with the current state of the resource.",
    429: "Too many requests. Please try again later.",
}
GENERIC_ERROR_MESSAGE = "The request could not be completed."

def default_message(status):
    if status < 400:
        if status == http.HTTP_201_CREATED:
            return DEFAULT_CREATED_MESSAGE
        return DEFAULT_SUCCESS_MESSAGE
    return DEFAULT_ERROR_MESSAGES.get(status, GENERIC_ERROR_MESSAGE)

def unexpected_error_message(request_id):
    return f"An unexpected error occurred. Reference: {request_id}"

def envelope(data, success, message):
    return {"data": data, "success": success, "message": message}

def _enveloped(data, success, message, status, headers):
    response = Response(envelope(data, success, message), status=status, headers=headers)
    response.is_enveloped = True
    return response

def api_response(data=None, message=None, status=http.HTTP_200_OK, headers=None):
    """The only constructor for success envelopes."""
    return _enveloped(data, True, message or default_message(status), status, headers)

def error_response(message, status, data=None, headers=None):
    """Error envelope. Used by the exception handler, not by views: views raise."""
    return _enveloped(data, False, message, status, headers)
