from django.contrib.auth.management.commands.createsuperuser import Command as CreateSuperuser

from audit import services as audit

class Command(CreateSuperuser):
    help = (
        "Creates a Super Admin account (a Django superuser). Super Admins administer the "
        "whole organization and create Admin and Viewer accounts; they have no stock or "
        "asset operations."
    )

    def handle(self, *args, **options):
        user_model = self.UserModel
        before = set(user_model.objects.filter(is_superuser=True).values_list("pk", flat=True))
        super().handle(*args, **options)
        for user in user_model.objects.filter(is_superuser=True).exclude(pk__in=before):
            audit.record(None, "accounts.super_admin.created", user, after={"email": user.email})