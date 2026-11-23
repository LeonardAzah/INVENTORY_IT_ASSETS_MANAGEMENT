from decimal import Decimal

from core.exceptions import DomainError

from ..choices import AssetStatus
from ..models import AssetAssignment, ITAsset

def employee_holds_no_assets(employee):
    held = list(
        AssetAssignment.objects.filter(employee=employee, returned_at__isnull=True)
        .select_related("asset__item")
        .order_by("asset__asset_tag")
    )
    if held:
        raise DomainError(
            "EMPLOYEE_HAS_ASSETS",
            f"{employee.first_name} {employee.last_name} still holds {len(held)} IT asset(s).",
            context={
                "assets": [
                    {
                        "id": str(assignment.asset_id),
                        "asset_tag": assignment.asset.asset_tag,
                        "item": assignment.asset.item.name,
                    }
                    for assignment in held
                ]
            },
        )

def item_has_assets(item):
    return ITAsset.objects.filter(item=item).exists()

def available_assets(balance):
    count = ITAsset.objects.filter(
        custody_warehouse_id=balance.warehouse_id,
        item_id=balance.item_id,
        status=AssetStatus.AVAILABLE,
    ).count()
    return Decimal(count)
