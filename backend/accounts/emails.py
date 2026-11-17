from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from djoser import utils

from notifications.choices import Kind
from notifications.services import email

def display_name(user):
    """The person's first name, or their email for an account with no employee record."""
    profile = getattr(user, "profile", None)
    return profile.employee.first_name if profile is not None else user.email

def full_name(user):
    profile = getattr(user, "profile", None)
    if profile is None:
        return user.email
    return f"{profile.employee.first_name} {profile.employee.last_name}"

def frontend_link(path, user, token):
    return f"{settings.FRONTEND_URL}/{path.format(uid=utils.encode_uid(user.pk), token=token)}"

def send_invitation(invitation, token, hours, on_result):
    user = invitation.user
    return email.send(
        Kind.INVITATION,
        user.email,
        {"name": display_name(user), "hours": hours},
        secrets={"link": frontend_link(settings.ACTIVATION_URL, user, token)},
        recipient_user=user,
        related=invitation,
        on_result=on_result,
    )

def send_it_manager_notice(kind, recipient, appointee, region, actor, reason):
    return email.send(
        kind,
        recipient.email,
        {
            "name": display_name(recipient),
            "appointee": full_name(appointee),
            "region": region.name,
            "actor": full_name(actor),
            "reason_line": f"\n\nReason given: {reason}" if reason else "",
        },
        recipient_user=recipient,
        related=appointee,
    )

class _DjoserEmail:
    """Stands in for a Djoser email class: `Email(request, context).send([address])`."""
    def __init__(self, request=None, context=None):
        self.user = (context or {})["user"]

    def send(self, to, *args, **kwargs):
        raise NotImplementedError

class PasswordResetEmail(_DjoserEmail):
    def send(self, to, *args, **kwargs):
        token = default_token_generator.make_token(self.user)
        email.send(
            Kind.PASSWORD_RESET,
            self.user.email,
            {"name": display_name(self.user)},
            secrets={"link": frontend_link(settings.PASSWORD_RESET_URL, self.user, token)},
            recipient_user=self.user,
            related=self.user,
        )

class PasswordChangedEmail(_DjoserEmail):
    def send(self, to, *args, **kwargs):
        email.send(
            Kind.PASSWORD_CHANGED,
            self.user.email,
            {"name": display_name(self.user)},
            recipient_user=self.user,
            related=self.user,
        )
