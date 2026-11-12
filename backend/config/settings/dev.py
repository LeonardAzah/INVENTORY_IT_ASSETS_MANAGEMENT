from .base import *
from .base import EMAIL_HOST_USER, env

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# Without Gmail credentials, emails are printed in the runserver console instead of sent.
if not EMAIL_HOST_USER and "EMAIL_BACKEND" not in env.ENVIRON:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
