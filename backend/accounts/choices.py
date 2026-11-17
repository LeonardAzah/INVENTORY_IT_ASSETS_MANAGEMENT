from django.db import models

class Role(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    ADMIN = "ADMIN", "Admin"
    VIEWER = "VIEWER", "Viewer"
    REGIONAL_REPRESENTATIVE = "REGIONAL_REPRESENTATIVE", "Regional Representative"
    MANAGER = "MANAGER", "Manager (Head of Commercial Branch)"
    CHIEF_OF_SERVICE = "CHIEF_OF_SERVICE", "Chief of Service (Head of Department)"
    EMPLOYEE = "EMPLOYEE", "Employee"

PROFILE_ROLES = tuple(role for role in Role.values if role != Role.SUPER_ADMIN)
PROFILE_ROLE_CHOICES = [(value, label) for value, label in Role.choices if value in PROFILE_ROLES]

REGIONAL_POST_ROLES = (Role.REGIONAL_REPRESENTATIVE.value, Role.CHIEF_OF_SERVICE.value)

class ProfileStatus(models.TextChoices):
    INVITED = "INVITED", "Invited"
    ACTIVE = "ACTIVE", "Active"
    DEACTIVATED = "DEACTIVATED", "Deactivated"

class ResponsibilityCode(models.TextChoices):
    STORE_KEEPER = "STORE_KEEPER", "Store Keeper"
    IT_ASSET_MANAGER = "IT_ASSET_MANAGER", "IT Asset Manager"

class DeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"