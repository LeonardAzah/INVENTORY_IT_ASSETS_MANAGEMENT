"""Settings shared by every environment. Values that differ come from the environment."""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
# Pipenv already loads backend/.env; this covers IDEs and runners started outside Pipenv.
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "djoser",
    "drf_spectacular",
    "core",
    "notifications",
    "audit",
    "accounts",
    "organization",
    "warehouses",
    "employees",
    "items",
    "inventory"
]

MIDDLEWARE = [
    "core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

# PostgreSQL >= 15 is required (UNIQUE ... NULLS NOT DISTINCT, partial indexes, triggers).
DATABASES = {
    "default": env.db("DATABASE_URL")
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},  # RQ-08
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
TIME_ZONE = "Africa/Douala"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "accounts.permissions.ReadOnlyForViewer",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "core.api.pagination.EnvelopePagination",
    "EXCEPTION_HANDLER": "core.api.exceptions.envelope_exception_handler",
    # `?format=` is a report parameter (json or pdf), not a renderer switch.
    "URL_FORMAT_OVERRIDE": None,

    # The OpenAPI schema documents every response inside the envelope (apps/core/api/schema.py).
    "DEFAULT_SCHEMA_CLASS": "core.api.schema.EnvelopeAutoSchema",
}

API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=False)
SPECTACULAR_SETTINGS = {
    "TITLE": "IAM API",
    "DESCRIPTION": (
        "Warehouse Inventory and IT Asset Management System. Every JSON response is "
        "wrapped in the envelope {data, success, message}; business-rule errors carry "
        "data: {error_code, context}."
    ),
    "VERSION": "1.0.0",
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "SERVE_INCLUDE_SCHEMA": False,
    # Off: inputs and outputs are already separate serializers (`*Input` / `*Output`),
    # so components keep the names they have in the code.
    "COMPONENT_SPLIT_REQUEST": False,
    # One name per choice set, wherever a field of that set appears.
    "ENUM_NAME_OVERRIDES": {
        "AdjustmentKindEnum": "inventory.choices.AdjustmentKind",
        # "AssetStatusEnum": "assets.choices.AssetStatus",
        "DepartmentKindEnum": "organization.choices.DepartmentKind",
        "NotificationKindEnum": "notifications.choices.Kind",
        "NotificationStatusEnum": "notifications.choices.Status",
        "OfficeKindEnum": "organization.choices.OfficeKind",
        # The roles an account can be given: every role but SUPER_ADMIN.
        "ProfileRoleEnum": "accounts.choices.PROFILE_ROLE_CHOICES",
        # "RelationshipKindEnum": "assets.choices.RelationshipKind",
        "RoleEnum": "accounts.choices.Role",
        "StockTakeStatusEnum": "inventory.choices.StockTakeStatus",
        "StockUnitStatusEnum": "inventory.choices.StockUnitStatus",
        "TransactionTypeEnum": "inventory.choices.TransactionType",
        "WarehouseTypeEnum": "warehouses.choices.WarehouseType",
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "core.api.schema.envelope_responses",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Only the routes listed in apps/accounts/urls.py are exposed; djoser.urls is never included.
DJOSER = {
    "LOGIN_FIELD": "email",
    "SET_PASSWORD_RETYPE": True,
    "PASSWORD_RESET_CONFIRM_RETYPE": True,
    "PASSWORD_RESET_SHOW_EMAIL_NOT_FOUND": False,
    "PASSWORD_CHANGED_EMAIL_CONFIRMATION": True,
    "SEND_ACTIVATION_EMAIL": False,
    "SEND_CONFIRMATION_EMAIL": False,
    "SERIALIZERS": {
        "current_user": "accounts.serializers.CurrentUserSerializer",
        "password_reset": "accounts.serializers.PasswordResetRequestSerializer",
    },
    # Djoser's own mailers are replaced: only the notifications app sends email (D-38).
    "EMAIL": {
        "password_reset": "accounts.emails.PasswordResetEmail",
        "password_changed_confirmation": "accounts.emails.PasswordChangedEmail",
    },
}

# Links in emails point at the frontend, which then calls the API.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000").rstrip("/")
ACTIVATION_URL = "activate/{uid}/{token}"
PASSWORD_RESET_URL = "reset-password/{uid}/{token}"

# Gmail SMTP, with the credentials in the environment (D-38).
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER or "no-reply@localhost")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
