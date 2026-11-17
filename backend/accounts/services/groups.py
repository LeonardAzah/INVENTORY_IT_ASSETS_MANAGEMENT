from django.contrib.auth.models import Group

from ..models import COMPUTING_CHIEF, UserProfile, UserResponsibility
from ..policy.groups import (
    COMPUTING_CHIEF_GROUP,
    MANAGED_GROUPS,
    RESPONSIBILITY_GROUPS,
    ROLE_GROUPS,
)

def sync(user):
    """Sets the user's role, post and responsibility groups from their profile and their
    active responsibilities. The only place that changes `user.groups`.

    Groups are kept while an account is INVITED or DEACTIVATED: an inactive user holds no
    codes whatever groups they are in, and reactivation then restores access as it was.
    A role this code no longer knows (a database migrated backwards) gets no role group.
    """
    wanted = set()
    profiles = UserProfile.objects.filter(user=user)
    role = profiles.values_list("role", flat=True).first()
    if role in ROLE_GROUPS:
        wanted.add(ROLE_GROUPS[role])
    if profiles.filter(COMPUTING_CHIEF).exists():
        wanted.add(COMPUTING_CHIEF_GROUP)
    active = UserResponsibility.objects.filter(user=user, ended_at__isnull=True)
    for code in active.values_list("responsibility_id", flat=True):
        wanted.add(RESPONSIBILITY_GROUPS[code])

    current = set(user.groups.filter(name__in=MANAGED_GROUPS).values_list("name", flat=True))
    if wanted - current:
        user.groups.add(*Group.objects.filter(name__in=wanted - current))
    if current - wanted:
        user.groups.remove(*Group.objects.filter(name__in=current - wanted))
