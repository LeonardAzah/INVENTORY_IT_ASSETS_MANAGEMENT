from django.apps import AppConfig
from django.db.models.signals import post_migrate



class AccountsConfig(AppConfig):
    name = 'accounts'
    label = "accounts"

    def ready(self):
        from core.api.exceptions import register_constraint_error

        from . import models
        from .policy.groups import seed_groups

        message = "A user with this email already exists."
        register_constraint_error(models.EMAIL_UNIQUE_CONSTRAINT, "EMAIL_ALREADY_IN_USE", message)
        register_constraint_error("accounts_user_email_key", "EMAIL_ALREADY_IN_USE", message)

        for constraint, error_code, text in (
            (
                models.ONE_POST_PER_REGION,
                "REGION_POST_TAKEN",
                "This region already has someone in this post: a region has one Regional "
                "Representative and one Chief of Service of Computing.",
            ),
            (
                models.ONE_IT_ASSET_MANAGER_PER_REGION,
                "REGION_HAS_IT_ASSET_MANAGER",
                "This region already has an IT Asset Manager.",
            ),
            (
                models.ONE_ACTIVE_RESPONSIBILITY,
                "RESPONSIBILITY_ALREADY_HELD",
                "The user already holds this responsibility.",
            ),
            (
                models.JURISDICTION_ACTIVE_UNIQUE,
                "JURISDICTION_EXISTS",
                "The user already has this jurisdiction.",
            ),
            (
                models.ONE_LIVE_INVITATION,
                "INVITATION_ALREADY_SENT",
                "This account already has a live invitation.",
            ),
            (
                "accounts_userprofile_employee_id_key",
                "EMPLOYEE_HAS_ACCOUNT",
                "This employee already has an account.",
            ),
        ):
            register_constraint_error(constraint, error_code, text)

        post_migrate.connect(seed_groups, dispatch_uid="accounts.seed_groups")   
