from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404

from audit import services as audit
from core.exceptions import DomainError

from .. import policy
from ..choices import ProfileStatus, Role
from ..models import UserProfile
from ..policy import Code
from . import groups, invitations, posts, role_scope, roles

AUDITED = ("employee", "role", "role_region", "status")

@transaction.atomic
def provision(actor, *, employee_id, email, role=Role.EMPLOYEE.value, jurisdiction=None):
    """Creates the account of an existing Employee, in status INVITED.

    The person's name and affiliation are not passed in: they are the Employee's.
    `jurisdiction` ({region, office, department}) is the one the role requires, given in
    the same request (role_scope). The account cannot log in until its owner follows the
    emailed invitation link and chooses a password.
    """
    policy.require_code(actor, Code.USER_PROVISION)
    employee_model = apps.get_model("employees", "Employee")
    employee = (
        employee_model.objects.select_for_update(of=("self",))
        .select_related("office")
        .filter(pk=employee_id)
        .first()
    )
    # An unknown employee and one outside the actor's jurisdiction look the same.
    if employee is None:
        raise Http404
    policy.require(actor, Code.USER_PROVISION, employee)
    roles.require_grantable(actor, role)
    scope = role_scope.resolve(actor, role, jurisdiction)

    if not employee.is_active:
        raise DomainError("EMPLOYEE_INACTIVE", "An inactive employee cannot be given an account.")
    if UserProfile.objects.filter(employee=employee).exists():
        raise DomainError(
            "EMPLOYEE_HAS_ACCOUNT", f"Employee {employee.matricule} already has an account."
        )
    user_model = get_user_model()
    email = user_model.objects.normalize_email(email)
    if employee.email and employee.email.lower() != email:
        raise DomainError(
            "EMAIL_MISMATCH",
            "The login email must be the email on the employee's record.",
            status_code=400,
        )

    user = user_model.objects.create_user(email, password=None, is_active=False)
    profile = UserProfile.objects.create(
        user=user,
        employee=employee,
        role=role,
        role_region_id=roles.region_for(role, scope),
        status=ProfileStatus.INVITED,
        created_by=actor,
    )
    role_scope.replace(actor, user, scope)
    posts.sync_computing_chief(actor, user)
    groups.sync(user)
    invitations.issue(actor, user)
    audit.record(
        actor,
        "accounts.user.provisioned",
        user,
        after={"email": user.email, **audit.snapshot(profile, AUDITED)},
    )
    return user
