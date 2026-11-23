from core.exceptions import DomainError

from .choices import AssetStatus as S

ALLOWED = {
    S.UNKNOWN: {S.AVAILABLE, S.ASSIGNED, S.MAINTENANCE, S.DAMAGED, S.RETIRED},
    S.AVAILABLE: {S.ASSIGNED, S.MAINTENANCE, S.DAMAGED, S.LOST, S.RETIRED},
    S.ASSIGNED: {S.ASSIGNED, S.RETURNED, S.MAINTENANCE, S.DAMAGED, S.LOST, S.RETIRED},
    S.RETURNED: {S.AVAILABLE, S.MAINTENANCE, S.DAMAGED, S.RETIRED},
    S.MAINTENANCE: {S.AVAILABLE, S.DAMAGED, S.LOST, S.RETIRED},
    S.DAMAGED: {S.MAINTENANCE, S.RETIRED},
    S.LOST: {S.RETIRED, S.UNKNOWN},
    S.RETIRED: set(),
}

def is_allowed(from_status, to_status):
    return to_status in ALLOWED[S(from_status)]

def check(from_status, to_status):
    if not is_allowed(from_status, to_status):
        allowed = sorted(status.value for status in ALLOWED[S(from_status)])
        raise DomainError(
            "INVALID_TRANSITION",
            f"An asset that is {from_status} cannot become {to_status}.",
            context={"from": str(from_status), "to": str(to_status), "allowed": allowed},
        )
