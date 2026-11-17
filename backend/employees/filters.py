from core.api.filters import StrictFilterSet

from .models import Employee

class EmployeeFilter(StrictFilterSet):
    class Meta:
        model = Employee
        fields = ["region", "office", "department", "is_active"]
