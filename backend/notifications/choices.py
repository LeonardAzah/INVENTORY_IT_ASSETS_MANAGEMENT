from django.db import models

class Kind(models.TextChoices):
    INVITATION = "INVITATION", "Account invitation"
    PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
    PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed"
    IT_MANAGER_APPOINTED = "IT_MANAGER_APPOINTED", "IT Asset Manager appointed"
    IT_MANAGER_REVOKED = "IT_MANAGER_REVOKED", "IT Asset Manager revoked"
    LOW_STOCK = "LOW_STOCK", "Low stock"
    ASSET_ASSIGNED = "ASSET_ASSIGNED", "IT asset assigned"

class Status(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"
