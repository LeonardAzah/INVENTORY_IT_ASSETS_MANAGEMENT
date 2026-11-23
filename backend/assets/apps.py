from django.apps import AppConfig


class AssetsConfig(AppConfig):
    name = 'assets'
    label = "assets"

    def ready(self):
        from core.api.exceptions import register_constraint_error
        from employees.services import employees
        from inventory.services import thresholds
        from items.services import items
        from warehouses.choices import WarehouseType

        from . import models
        from .services import guards

        for constraint, error_code, message in (
            (
                models.SERIAL_UNIQUE_PER_ITEM,
                "DUPLICATE_SERIAL",
                "An asset of this item already has this serial number.",
            ),
            (
                models.ONE_ACTIVE_ASSIGNMENT,
                "ASSET_ALREADY_ASSIGNED",
                "This asset already has an active assignment.",
            ),
            (
                models.ONE_ACTIVE_RELATIONSHIP,
                "RELATIONSHIP_EXISTS",
                "This relationship already exists.",
            ),
            (
                models.ONE_PARENT_COMPUTER,
                "PERIPHERAL_ALREADY_LINKED",
                "This peripheral is already linked to a computer.",
            ),
            (
                models.ONE_REQUEST_PER_CLIENT_ID,
                "REQUEST_IN_PROGRESS",
                "This request is already being processed. Send it again in a moment.",
            ),
            (
                "assets_acquisition_registered_within_quantity",
                "NOTHING_LEFT_TO_REGISTER",
                "Every unit of this acquisition is already registered.",
            ),
            (
                "inventory_receiptline_registered_within_quantity",
                "NOTHING_LEFT_TO_REGISTER",
                "Every unit of this receipt line is already registered.",
            ),
        ):
            register_constraint_error(constraint, error_code, message)

        # Lower apps cannot import this one; they ask through these hooks instead.
        employees.deactivation_checks.append(guards.employee_holds_no_assets)
        items.usage_checks.append(guards.item_has_assets)
        thresholds.available_providers[WarehouseType.IT.value] = guards.available_assets
