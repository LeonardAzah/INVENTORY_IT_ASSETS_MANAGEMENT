from django.apps import AppConfig


class ItemsConfig(AppConfig):
    name = 'items'
    label = "items"

    def ready(self):
        from core.api.exceptions import register_constraint_error

        from . import models

        for constraint, error_code, message in (
            (models.UNIT_CODE_UNIQUE, "UNIT_CODE_IN_USE", "A unit with this code exists."),
            (
                models.CATEGORY_NAME_UNIQUE,
                "CATEGORY_NAME_IN_USE",
                "A category with this name exists for this warehouse type.",
            ),
            (models.ITEM_CODE_UNIQUE, "ITEM_CODE_IN_USE", "An item with this code exists."),
            (
                models.TEMPLATE_CODE_UNIQUE,
                "TEMPLATE_CODE_IN_USE",
                "A specification template with this code exists.",
            ),
            (
                models.FIELD_KEY_UNIQUE,
                "SPEC_KEY_IN_USE",
                "This template already has a field with this key.",
            ),
        ):
            register_constraint_error(constraint, error_code, message)
