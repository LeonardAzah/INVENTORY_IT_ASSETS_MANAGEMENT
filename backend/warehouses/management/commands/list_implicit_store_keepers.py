from django.core.management.base import BaseCommand

from accounts.choices import ResponsibilityCode
from accounts.models import UserResponsibility
from audit.models import AuditLog

from ...models import WarehouseAssignment

GRANTED = "accounts.responsibility.granted"

def implicit_store_keepers():
    """Active Store Keeper responsibilities that no deliberate grant accounts for."""
    audited = AuditLog.objects.filter(action=GRANTED).values_list("object_id", flat=True)
    return (
        UserResponsibility.objects.filter(
            responsibility=ResponsibilityCode.STORE_KEEPER, ended_at__isnull=True
        )
        .exclude(pk__in=[value for value in audited if value])
        .select_related("user__profile__employee", "granted_by")
        .order_by("user__email")
    )

class Command(BaseCommand):
    help = (
        "Lists the people who hold the Store Keeper responsibility only because a warehouse "
        "was assigned to them before it had to be granted deliberately. Changes nothing."
    )

    def handle(self, *args, **options):
        held = list(implicit_store_keepers())
        if not held:
            self.stdout.write("No implicitly granted Store Keeper responsibility.")
            return
        self.stdout.write(
            f"{len(held)} Store Keeper responsibilit{'y' if len(held) == 1 else 'ies'} "
            "granted implicitly by a warehouse assignment (to confirm or revoke):"
        )
        for responsibility in held:
            user = responsibility.user
            employee = getattr(getattr(user, "profile", None), "employee", None)
            who = (
                f"{employee.first_name} {employee.last_name} ({employee.matricule})"
                if employee
                else "-"
            )
            kept = ", ".join(
                WarehouseAssignment.objects.filter(user=user, ended_at__isnull=True)
                .order_by("warehouse__code")
                .values_list("warehouse__code", flat=True)
            )
            self.stdout.write(
                f"  {user.email:32} {who:40} since {responsibility.granted_at:%Y-%m-%d} "
                f"by {responsibility.granted_by.email}; keeps: {kept or 'no warehouse'}"
            )
