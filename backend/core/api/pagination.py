from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

class EnvelopePagination(PageNumberPagination):
    """`page` / `page_size` pagination. EnvelopeMixin puts the result in `data`."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "results": data,
                "pagination": {
                    "count": self.page.paginator.count,
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_pages": self.page.paginator.num_pages,
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                },
            }
        )

    def get_paginated_response_schema(self, schema):
        """For the OpenAPI schema: the shape above, which the envelope then wraps."""
        nullable_url = {"type": "string", "format": "uri", "nullable": True}
        return {
            "type": "object",
            "properties": {
                "results": schema,
                "pagination": {
                    "type": "object",
                    "properties": {
                        "count": {"type": "integer"},
                        "page": {"type": "integer"},
                        "page_size": {"type": "integer"},
                        "total_pages": {"type": "integer"},
                        "next": nullable_url,
                        "previous": nullable_url,
                    },
                    "required": [
                        "count",
                        "page",
                        "page_size",
                        "total_pages",
                        "next",
                        "previous",
                    ],
                },
            },
            "required": ["results", "pagination"],
        }