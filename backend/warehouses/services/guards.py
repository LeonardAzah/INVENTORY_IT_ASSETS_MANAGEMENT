from organization.services.common import require_no_active

def office_has_no_active_warehouse(office):
    """An office cannot be deactivated while it still has an active warehouse."""
    require_no_active(office.warehouses, "warehouses", f"Office {office.code}")
