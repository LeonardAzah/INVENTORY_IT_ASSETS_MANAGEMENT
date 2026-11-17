from django.db.models import Q

from accounts import policy

from .models import Employee

def employees_for(user):
    """Administrators see the whole register. Anyone else sees only the employees inside
    a scope they hold: their jurisdictions, their IT regions, and the regions of the
    warehouses they keep (a Store Keeper issues stock to employees of the warehouse's
    region). No scope, no employees.
    """
    queryset = Employee.objects.select_related("region", "office", "department", "work_location")
    context = policy.context_for(user)
    if context.administers_organization:
        return queryset
    return queryset.filter(
        policy.jurisdiction_q(context)
        | Q(region_id__in=context.it_regions)
        | Q(region_id__in=context.warehouse_regions)
    )
