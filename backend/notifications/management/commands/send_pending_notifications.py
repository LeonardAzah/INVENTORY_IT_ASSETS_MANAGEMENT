from django.core.management.base import BaseCommand

from notifications.services import email

class Command(BaseCommand):
    help = (
        "Sends again the emails whose delivery failed. Emails that carried a one-time "
        "link (invitations, password resets) are skipped: issue a new link instead."
    )
    def handle(self, *args, **options):
        sent, failing = email.send_failed()
        self.stdout.write(f"{sent} sent, {failing} still failing.")
