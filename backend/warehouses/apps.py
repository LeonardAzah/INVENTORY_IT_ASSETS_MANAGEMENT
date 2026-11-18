from django.apps import AppConfig


class WarehousesConfig(AppConfig):
    name = 'warehouses'
    label = "warehouses"

    def ready(self):
        from accounts.services import responsibilities
        from core.api.exceptions import register_constraint_error
        from organization.services import offices

        from . import models
        from .services import guards, store_keepers

        responsibilities.revokers["STORE_KEEPER"] = store_keepers.revoke_all
        offices.deactivation_checks.append(guards.office_has_no_active_warehouse)

        for constraint, error_code, message in (
            (
                models.WAREHOUSE_CODE_UNIQUE,
                "WAREHOUSE_CODE_IN_USE",
                "A warehouse with this code exists.",
            ),
            (
                models.WAREHOUSE_ONE_IT_PER_REGION,
                "REGION_HAS_IT_WAREHOUSE",
                "This region already has an active IT warehouse.",
            ),
            (
                models.WAREHOUSE_ONE_REGIONAL_STORE_PER_REGION,
                "REGION_HAS_REGIONAL_STORE",
                "This region already has an active regional store.",
            ),
            (
                models.ONE_STORE_KEEPER,
                "WAREHOUSE_HAS_STORE_KEEPER",
                "This warehouse already has a Store Keeper.",
            ),
        ):
            register_constraint_error(constraint, error_code, message)