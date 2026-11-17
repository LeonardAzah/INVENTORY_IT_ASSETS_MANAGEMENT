from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from core.models import UUIDModel

from .choices import (
    PROFILE_ROLE_CHOICES,
    PROFILE_ROLES,
    REGIONAL_POST_ROLES,
    DeliveryStatus,
    ProfileStatus,
    ResponsibilityCode,
    Role
)
from .managers import UserManager

EMAIL_UNIQUE_CONSTRAINT = "accounts_user_email_ci_unique"
ONE_POST_PER_REGION = "accounts_userprofile_one_post_per_region"
ONE_ACTIVE_RESPONSIBILITY = "accounts_userresponsibility_one_active"
ONE_IT_ASSET_MANAGER_PER_REGION = "accounts_userresponsibility_one_it_manager_per_region"
JURISDICTION_ACTIVE_UNIQUE = "accounts_userjurisdiction_active_unique"
ONE_LIVE_INVITATION = "accounts_accountinvitation_one_live"

class User(UUIDModel, AbstractBaseUser, PermissionsMixin):
    """Login identity only. The person's name and affiliation live on their Employee."""
    email = models.EmailField(max_length=254, unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(Lower("email"), name=EMAIL_UNIQUE_CONSTRAINT),
        ]

    def __str__(self):
        return self.email

class UserProfile(models.Model):
    """The application side of an account: who the person is and which role they hold. 
    Every account except the boostrap superuser has one, linked to an employee.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        primary_key=True,
        on_delete=models.PROTECT,
        related_name="profile"
    )
    employee = models.OneToOneField(
        "employees.Employee", on_delete=models.PROTECT, related_name="user_profile"
    )
    role = models.CharField(max_length=24, choices=PROFILE_ROLE_CHOICES)
    