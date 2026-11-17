"""Subject and plain-text body of each email, filled in with `str.format`. The HTML part
is derived from the text."""

from django.utils.html import linebreaks, urlize

from .choices import Kind

APP_NAME = "Warehouse and IT Asset Management System"
SIGNATURE = f"\n\n{APP_NAME}\nThis is an automated message. Please do not reply."

TEMPLATES = {
    Kind.INVITATION: (
        "Your account is ready to be activated",
        "Hello {name},\n\n"
        "An account has been created for you. Choose your password to activate it. "
        "This link works once and expires in {hours} hours:\n\n{link}\n\n"
        "If you were not expecting this message, you can ignore it.",
    ),
    Kind.PASSWORD_RESET: (
        "Reset your password",
        "Hello {name},\n\n"
        "A password reset was requested for your account. Choose a new password here:\n\n"
        "{link}\n\n"
        "If you did not ask for this, you can ignore this message; your password is unchanged.",
    ),
    Kind.PASSWORD_CHANGED: (
        "Your password was changed",
        "Hello {name},\n\n"
        "The password of your account was just changed. "
        "If this was not you, contact your administrator immediately.",
    ),
    Kind.IT_MANAGER_APPOINTED: (
        "IT Asset Manager appointed for {region}",
        "Hello {name},\n\n"
        "{appointee} has been appointed IT Asset Manager for the {region} region by {actor}."
        "{reason_line}",
    ),
    Kind.IT_MANAGER_REVOKED: (
        "IT Asset Manager appointment ended for {region}",
        "Hello {name},\n\n"
        "The appointment of {appointee} as IT Asset Manager for the {region} region was ended "
        "by {actor}.{reason_line}",
    ),
}

TEMPLATES[Kind.LOW_STOCK] = (
    "Low stock: {item} at {warehouse}",
    "Stock of {item} in warehouse {warehouse} is low.\n\n"
    "Available: {available} {unit}\nThreshold: {threshold} {unit}\n\n"
    "You will not be reminded again until the stock has risen above the threshold.",
)
TEMPLATES[Kind.ASSET_ASSIGNED] = (
    "IT equipment assigned to you: {asset}",
    "Hello {name},\n\n"
    "The following IT equipment has been assigned to you:\n\n"
    "{asset}\nAsset tag: {tag}\nLocation: {location}\n\n"
    "If you have not received it, contact your Regional IT department.",
)

REDACTED = "[link removed from the stored copy]"


def to_html(text):
    return linebreaks(urlize(text, autoescape=True))


def render(kind, context, secrets=None):
    """Returns (subject, text to send, text to store). Values in `secrets` appear only in
    the text that is sent."""
    subject_template, body_template = TEMPLATES[Kind(kind)]
    secrets = secrets or {}
    subject = subject_template.format(**context)
    body = body_template + SIGNATURE
    sent = body.format(**context, **secrets)
    stored = body.format(**context, **dict.fromkeys(secrets, REDACTED))
    return subject, sent, stored
