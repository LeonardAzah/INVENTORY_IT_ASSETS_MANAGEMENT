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

    Every account except the bootstrap superuser has one, linked to an Employee. The
    service keeps `User.is_active = (status == ACTIVE)`.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        primary_key=True,
        on_delete=models.PROTECT,
        related_name="profile",
    )
    employee = models.OneToOneField(
        "employees.Employee", on_delete=models.PROTECT, related_name="user_profile"
    )
    role = models.CharField(max_length=24, choices=PROFILE_ROLE_CHOICES)
    role_region = models.ForeignKey(
        "organization.Region", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=12, choices=ProfileStatus.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        default_permissions = ()
        permissions = [
            ("user_provision", "Provision user accounts"),
            ("user_manage", "View and manage user accounts"),
            ("user_view", "View user accounts, read-only"),
            ("role_grant", "Grant the Manager, Chief of Service and Employee roles"),
            ("role_grant_regional", "Grant the Regional Representative role"),
            ("role_grant_privileged", "Grant the Admin and Viewer roles"),
            ("jurisdiction_manage", "Manage user jurisdictions"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(role__in=PROFILE_ROLES), name="accounts_userprofile_role_valid"
            ),
            models.CheckConstraint(
                condition=Q(status__in=ProfileStatus.values),
                name="accounts_userprofile_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(role_region__isnull=True) | Q(role__in=REGIONAL_POST_ROLES),
                name="accounts_userprofile_role_region_only_for_posts",
            ),
            models.CheckConstraint(
                condition=~Q(role=Role.REGIONAL_REPRESENTATIVE) | Q(role_region__isnull=False),
                name="accounts_userprofile_representative_has_region",
            ),
            # One Regional Representative and one Chief of Service of Computing per region.
            models.UniqueConstraint(
                fields=["role", "role_region"],
                condition=Q(role_region__isnull=False) & ~Q(status=ProfileStatus.DEACTIVATED),
                name=ONE_POST_PER_REGION,
            ),
        ]
        indexes = [
            models.Index(fields=["role", "status"], name="accounts_userprofile_role"),
        ]

    def __str__(self):
        return f"{self.user} ({self.role})"

    @property
    def is_computing_chief(self):
        """The Chief of Service of Computing of `role_region` (P-03). Same rule as the
        COMPUTING_CHIEF filter below."""
        return self.role == Role.CHIEF_OF_SERVICE and self.role_region_id is not None


# The two posts held through `role_region`, as filters on UserProfile. Use these rather
# than comparing roles: they are the definition of each post.
COMPUTING_CHIEF = Q(role=Role.CHIEF_OF_SERVICE, role_region__isnull=False)
REGIONAL_REPRESENTATIVE = Q(role=Role.REGIONAL_REPRESENTATIVE)

class Responsibility(models.Model):
    """An operational responsibility a user can hold on top of their role. Seeded."""

    code = models.CharField(max_length=32, primary_key=True, choices=ResponsibilityCode.choices)
    name = models.CharField(max_length=100)
    group = models.OneToOneField("auth.Group", on_delete=models.PROTECT, related_name="+")

    class Meta:
        default_permissions = ()
        verbose_name_plural = "responsibilities"

    def __str__(self):
        return self.name

class UserResponsibility(UUIDModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="responsibilities"
    )
    responsibility = models.ForeignKey(Responsibility, on_delete=models.PROTECT, related_name="+")
    region = models.ForeignKey(
        "organization.Region", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    granted_at = models.DateTimeField(default=timezone.now)
    ended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        default_permissions = ()
        permissions = [
            ("it_asset_manager_appoint", "Appoint and revoke the IT Asset Manager of a region"),
            ("store_keeper_grant", "Grant and revoke the Store Keeper responsibility"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(responsibility=ResponsibilityCode.IT_ASSET_MANAGER, region__isnull=False)
                    | (
                        ~Q(responsibility=ResponsibilityCode.IT_ASSET_MANAGER)
                        & Q(region__isnull=True)
                    )
                ),
                name="accounts_userresponsibility_it_manager_has_region",
            ),
            models.UniqueConstraint(
                fields=["user", "responsibility"],
                condition=Q(ended_at__isnull=True),
                name=ONE_ACTIVE_RESPONSIBILITY,
            ),
            models.UniqueConstraint(
                fields=["region"],
                condition=Q(
                    responsibility=ResponsibilityCode.IT_ASSET_MANAGER, ended_at__isnull=True
                ),
                name=ONE_IT_ASSET_MANAGER_PER_REGION,
            ),
        ]

    def __str__(self):
        return f"{self.user} {self.responsibility_id}"


class UserJurisdiction(UUIDModel):
    """A management scope: a whole region, an office with its child offices, or one
    department. A user with no active row has no management scope at all."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="jurisdictions"
    )
    region = models.ForeignKey("organization.Region", on_delete=models.PROTECT, related_name="+")
    office = models.ForeignKey(
        "organization.Office", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    department = models.ForeignKey(
        "organization.Department", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    granted_at = models.DateTimeField(default=timezone.now)
    ended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        default_permissions = ()
        constraints = [
            models.CheckConstraint(
                condition=Q(department__isnull=True) | Q(office__isnull=False),
                name="accounts_userjurisdiction_department_needs_office",
            ),
            models.UniqueConstraint(
                fields=["user", "region", "office", "department"],
                condition=Q(ended_at__isnull=True),
                nulls_distinct=False,
                name=JURISDICTION_ACTIVE_UNIQUE,
            ),
        ]
        indexes = [
            models.Index(
                fields=["user"],
                condition=Q(ended_at__isnull=True),
                name="accounts_userjurisdiction_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} @ {self.region_id}"


class AccountInvitation(UUIDModel):
    """The one-time link that lets an invited person choose a password. Only the SHA-256
    of the token is stored; the token itself exists only in the email."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="invitations"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    delivery_status = models.CharField(
        max_length=8, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(used_at__isnull=True, revoked_at__isnull=True),
                name=ONE_LIVE_INVITATION,
            ),
        ]

    def __str__(self):
        return f"Invitation for {self.user}"
