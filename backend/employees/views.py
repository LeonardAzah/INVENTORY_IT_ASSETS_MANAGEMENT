from django.shortcuts import get_object_or_404

from core.api.responses import api_response
from core.api.views import (
    BaseAPIView,
    GenericListCreateViewAPI,
    GenericRetrieveUpdateViewAPI,
)

from . import selectors, serializers
from .filters import EmployeeFilter
from .services import employees

class EmployeeListCreateView(GenericListCreateViewAPI):
    selector = selectors.employees_for
    filterset_class = EmployeeFilter
    search_fields = ("matricule", "first_name", "last_name", "email")
    ordering_fields = ("last_name", "matricule")
    ordering = ("last_name", "first_name", "matricule")
    input_serializer_class = serializers.EmployeeInput
    output_serializer_class = serializers.EmployeeOutput
    create_service = employees.create_employee
    success_messages = {"POST": "Employee created successfully."}

class EmployeeDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.employees_for
    input_serializer_class = serializers.EmployeeInput
    output_serializer_class = serializers.EmployeeOutput
    update_service = employees.update_employee
    success_messages = {"PATCH": "Employee updated successfully."}

class _EmployeeAction(BaseAPIView):
    service = None
    message = ""

    def post(self, request, pk):
        employee = get_object_or_404(selectors.employees_for(request.user), pk=pk)
        serializer = serializers.ReasonInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = type(self).service(request.user, employee, **serializer.validated_data)
        fresh = selectors.employees_for(request.user).get(pk=employee.pk)
        return api_response(serializers.EmployeeOutput(fresh).data, message=self.message)

class EmployeeDeactivateView(_EmployeeAction):
    service = employees.deactivate
    message = "Employee deactivated."

class EmployeeReactivateView(_EmployeeAction):
    service = employees.reactivate
    message = "Employee reactivated."
