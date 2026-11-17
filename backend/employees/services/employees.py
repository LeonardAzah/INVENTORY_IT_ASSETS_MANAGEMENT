from django.db import transaction
from django.utils import timezone

from accounts import policy
from accounts.policy import Code
from audit import services as audit
from core.exceptions import DomainError

from ..models import Employee

AUDITED = (
    "matricule",
    "first_name",
    "last_name",
    "email",
    "telephone",
    "region",
    "office",
    "department",
    "work_location",
    "is_active",
)

deactivation_checks = []

def _invalid(error_code, message):
    return DomainError(error_code, message, status_code=400)

def _set_affiliation(employee, department):
    if not department.is_active:
        raise _invalid("INACTIVE_DEPARTMENT", f"The department {department.code} is inactive.")
    employee.department = department
    employee.office_id = department.office_id
    employee.region_id = department.region_id

def _check_work_location(employee):
    location = employee.work_location
    if location is None:
        return
    if not location.is_active:
        raise _invalid("INACTIVE_LOCATION", "The work location is inactive.")
    if location.region_id != employee.region_id:
        raise _invalid(
            "LOCATION_IN_OTHER_REGION", "The work location must be in the employee's region."
        )

def _normalize(values):
    if "matricule" in values:
        values["matricule"] = values["matricule"].upper()
    if values.get("email"):
        values["email"] = values["email"].lower()
    elif "email" in values:
        values["email"] = None

@transaction.atomic
def create_employee(
    actor,
    *,
    matricule,
    first_name,
    last_name,
    telephone,
    department,
    email=None,
    work_location=None,
):
    policy.require(actor, Code.EMPLOYEE_MANAGE)
    values = {"matricule": matricule, "email": email}
    _normalize(values)
    employee = Employee(
        first_name=first_name,
        last_name=last_name,
        telephone=telephone,
        work_location=work_location,
        created_by=actor,
        **values,
    )
    _set_affiliation(employee, department)
    _check_work_location(employee)
    employee.save()
    audit.record(
        actor, "employees.employee.created", employee, after=audit.snapshot(employee, AUDITED)
    )
    return employee

@transaction.atomic
def update_employee(actor, employee, **changes):
    policy.require(actor, Code.EMPLOYEE_MANAGE)
    employee = Employee.objects.select_for_update().get(pk=employee.pk)
    before = audit.snapshot(employee, AUDITED)
    _normalize(changes)

    department = changes.pop("department", None)
    if department is not None and department.pk != employee.department_id:
        _set_affiliation(employee, department)
    for name, value in changes.items():
        setattr(employee, name, value)
    _check_work_location(employee)

    after = audit.snapshot(employee, AUDITED)
    if after == before:
        return employee

    profile = getattr(employee, "user_profile", None)
    if profile is not None and employee.email and employee.email != profile.user.email:
        raise DomainError(
            "EMAIL_MISMATCH",
            "This employee has a user account with a different login email.",
            context={"login_email": profile.user.email},
        )
    employee.save()
    audit.record(actor, "employees.employee.updated", employee, before=before, after=after)
    return employee

@transaction.atomic
def deactivate(actor, employee, *, reason):
    policy.require(actor, Code.EMPLOYEE_MANAGE)
    employee = Employee.objects.select_for_update().get(pk=employee.pk)
    if not employee.is_active:
        raise DomainError("EMPLOYEE_INACTIVE", "This employee is already inactive.")
    for check in deactivation_checks:
        check(employee)
    employee.is_active = False
    employee.deactivated_at = timezone.now()
    employee.deactivated_by = actor
    employee.save(update_fields=["is_active", "deactivated_at", "deactivated_by"])
    audit.record(
        actor,
        "employees.employee.deactivated",
        employee,
        before={"is_active": True},
        after={"is_active": False, "reason": reason},
    )
    return employee

@transaction.atomic
def reactivate(actor, employee, *, reason):
    policy.require(actor, Code.EMPLOYEE_MANAGE)
    employee = (
        Employee.objects.select_for_update(of=("self",))
        .select_related("department")
        .get(pk=employee.pk)
    )
    if employee.is_active:
        raise DomainError("EMPLOYEE_ACTIVE", "This employee is already active.")
    if not employee.department.is_active:
        raise _invalid(
            "INACTIVE_DEPARTMENT", f"The department {employee.department.code} is inactive."
        )
    employee.is_active = True
    employee.deactivated_at = None
    employee.deactivated_by = None
    employee.save(update_fields=["is_active", "deactivated_at", "deactivated_by"])
    audit.record(
        actor,
        "employees.employee.reactivated",
        employee,
        before={"is_active": False},
        after={"is_active": True, "reason": reason},
    )
    return employee
