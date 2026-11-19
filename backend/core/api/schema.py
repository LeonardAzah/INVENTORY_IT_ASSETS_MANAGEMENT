from drf_spectacular.openapi import AutoSchema
from drf_spectacular.utils import OpenApiResponse
from rest_framework.generics import GenericAPIView

WRITE_METHODS = ("POST", "PUT", "PATCH", "DELETE")
REPLAYED = "The same `client_request_id` again: the record made the first time."

ERROR_ENVELOPE = "ErrorEnvelope"
VALIDATION_ERROR_ENVELOPE = "ValidationErrorEnvelope"
DOMAIN_ERROR_ENVELOPE = "DomainErrorEnvelope"

def _declared_model(view_class):
    filterset_class = getattr(view_class, "filterset_class", None)
    if filterset_class is not None and filterset_class._meta.model is not None:
        return filterset_class._meta.model
    serializer_class = getattr(view_class, "output_serializer_class", None)
    meta = getattr(serializer_class, "Meta", None)
    return getattr(meta, "model", None)

class EnvelopeAutoSchema(AutoSchema):
    def _declared(self, name):
        return getattr(type(self.view), name, None)

    def get_operation(self, *args, **kwargs):

        view = self.view
        fake = getattr(view, "swagger_fake_view", False)
        if fake and isinstance(view, GenericAPIView) and view.queryset is None:
            model = _declared_model(type(view))
            if model is not None:
                view.queryset = model._default_manager.none()
        return super().get_operation(*args, **kwargs)

    def get_request_serializer(self):
        if self.method == "DELETE":
            return None
        serializer_class = self._declared("input_serializer_class")
        if serializer_class is not None and self.method in WRITE_METHODS:
            return serializer_class
        return super().get_request_serializer()

    def _get_request_body(self, direction="request"):

        if self.method != "DELETE" or self.get_request_serializer() is None:
            return super()._get_request_body(direction)
        self.method = "POST"
        try:
            return super()._get_request_body(direction)
        finally:
            self.method = "DELETE"

    def get_response_serializers(self):
        serializer_class = self._declared("output_serializer_class")
        if serializer_class is None:
            return super().get_response_serializers()
        if self.method == "POST" and self._replayable():
            return {
                201: serializer_class,
                200: OpenApiResponse(serializer_class, description=REPLAYED),
            }
        return serializer_class

    def _replayable(self):
        input_class = self._declared("input_serializer_class")
        return input_class is not None and "client_request_id" in input_class().fields

    def is_excluded(self):
        # A detail view without `update_service` answers 405 to PATCH: not an operation.
        if self.method == "PATCH" and hasattr(type(self.view), "update_service"):
            return self._declared("update_service") is None
        return super().is_excluded()

def _envelope(data_schema, *, success):
    return {
        "type": "object",
        "properties": {
            "data": data_schema,
            "success": {"type": "boolean", "enum": [success]},
            "message": {"type": "string"},
        },
        "required": ["data", "success", "message"],
    }

def _ref(name):
    return {"$ref": f"#/components/schemas/{name}"}

ERROR_COMPONENTS = {
    ERROR_ENVELOPE: _envelope(
        {
            "type": "object",
            "nullable": True,
            "additionalProperties": {},
            "description": "Null, or details that depend on the error.",
        },
        success=False,
    ),
    VALIDATION_ERROR_ENVELOPE: _envelope(
        {
            "type": "object",
            "description": (
                "Field name (or `non_field_errors`) to messages; a nested object for a "
                "nested input such as a document line."
            ),
            "additionalProperties": {},
        },
        success=False,
    ),
    DOMAIN_ERROR_ENVELOPE: _envelope(
        {
            "type": "object",
            "properties": {
                "error_code": {"type": "string", "description": "A business-rule code."},
                "context": {"type": "object", "additionalProperties": {}},
            },
            "required": ["error_code", "context"],
        },
        success=False,
    ),
}

def _json(schema):
    return {"application/json": {"schema": schema}}

def _error(description, schema):
    return {"description": description, "content": _json(schema)}

def _is_public(operation):
    security = operation.get("security")
    return not security or {} in security

def _wrap_success(code, response):
    content = response.get("content")
    if code == "204" or not content:
        null = {"type": "object", "nullable": True, "description": "Always null."}
        return {
            "description": response.get("description") or "",
            "content": _json(_envelope(null, success=True)),
        }
    json_body = content.get("application/json")
    if json_body is not None and "schema" in json_body:
        json_body["schema"] = _envelope(json_body["schema"], success=True)
    return response

def _add_errors(path, method, operation):
    responses = operation["responses"]
    has_query = any(p.get("in") == "query" for p in operation.get("parameters", ()))
    if method.upper() in WRITE_METHODS or has_query:
        responses.setdefault(
            "400",
            _error(
                "Validation failed, an unknown query parameter, or a business rule that "
                "depends only on the input.",
                {"oneOf": [_ref(VALIDATION_ERROR_ENVELOPE), _ref(DOMAIN_ERROR_ENVELOPE)]},
            ),
        )
    if not _is_public(operation):
        responses.setdefault(
            "401", _error("Not signed in, or the token is invalid.", _ref(ERROR_ENVELOPE))
        )
        responses.setdefault("403", _error("Not allowed.", _ref(ERROR_ENVELOPE)))
    if "{" in path:
        responses.setdefault(
            "404", _error("Not found, or outside what you can see.", _ref(ERROR_ENVELOPE))
        )
    if method.upper() in WRITE_METHODS:
        responses.setdefault(
            "409",
            _error(
                "A business rule refused the request.",
                _ref(DOMAIN_ERROR_ENVELOPE),
            ),
        )

def envelope_responses(result, generator, request, public):
    """drf-spectacular post-processing hook: the envelope on every documented response."""
    for path, operations in result.get("paths", {}).items():
        for method, operation in operations.items():
            responses = operation.get("responses", {})
            for code in list(responses):
                if code.startswith("2"):
                    wrapped = _wrap_success(code, responses.pop(code))
                    responses["200" if code == "204" else code] = wrapped
                elif "content" not in responses[code]:
                    # An annotated error (e.g. sign-in's 401) keeps its description.
                    responses[code]["content"] = _json(_ref(ERROR_ENVELOPE))
            _add_errors(path, method, operation)
    schemas = result.setdefault("components", {}).setdefault("schemas", {})
    schemas.update(ERROR_COMPONENTS)
    return result
