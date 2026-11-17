from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from djoser import views as djoser_views
from rest_framework import serializers as drf_serializers
from rest_framework import status as http
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt import views as jwt_views

from core.api.mixins import EnvelopeMixin
from core.api.responses import api_response
from core.api.views import (
    BaseAPIView,
    GenericListCreateViewAPI,
    GenericListViewAPI,
    GenericRetrieveUpdateViewAPI,
)

from . import policy, selectors, serializers
from .choices import Role
from .filters import AccountFilter, CandidateFilter, JurisdictionFilter
from .policy import Code
from .services import (
    invitations,
    jurisdictions,
    management,
    provisioning,
    responsibilities,
    role_scope,
    roles,
)

class TokenObtainPairView(EnvelopeMixin, jwt_views.TokenObtainPairView):
    viewer_may_write = True
    success_messages = {"POST": "Logged in successfully."}

class TokenRefreshView(EnvelopeMixin, jwt_views.TokenRefreshView):
    viewer_may_write = True
    success_messages = {"POST": "Token refreshed successfully."}

class TokenVerifyView(EnvelopeMixin, jwt_views.TokenVerifyView):
    viewer_may_write = True
    success_messages = {"POST": "Token is valid."}

class LogoutView(EnvelopeMixin, jwt_views.TokenBlacklistView):
    """Blacklists the refresh token. Needs no access token, so an expired session can
    still be closed."""
    viewer_may_write = True

    def post(self, request, *args, **kwargs):
        super().post(request, *args, **kwargs)
        return api_response(None, message="Logged out successfully.")

class CurrentUserView(EnvelopeMixin, djoser_views.UserViewSet):
    pass

class SetPasswordView(EnvelopeMixin, djoser_views.UserViewSet):
    viewer_may_write = True 
    success_messages = {"POST": "Password changed successfully."}

class ResetPasswordView(EnvelopeMixin, djoser_views.UserViewSet):
    viewer_may_write = True
    success_messages = {
        "POST": "If this email belongs to an active account, a reset link has been sent."
    }

class ResetPasswordConfirmView(EnvelopeMixin, djoser_views.UserViewSet):
    viewer_may_write = True
    success_messages = {"POST": "Password reset successfully."}

# Accounts
class AccountListView(GenericListViewAPI):
    selector = selectors.users_for
    filterset_class = AccountFilter
    search_fields = (
        "email",
        "profile__employee__first_name",
        "profile__employee__last_name",
        "profile__employee__matricule",
    )
    ordering_fields = ("email", "date_joined")
    ordering = ("email",)
    output_serializer_class = serializers.AccountOutput

class AccountDetailView(GenericRetrieveUpdateViewAPI):
    selector = selectors.users_for
    input_serializer_class = serializers.AccountUpdateInput
    output_serializer_class = serializers.AccountDetailOutput
    update_service = management.update_account
    success_messages = {"PATCH": "Account updated successfully."}

def _render(user_id):
    """An account as its detail view shows it, for the response of an action."""
    account = selectors.application_accounts().get(pk=user_id)
    return serializers.AccountDetailOutput(account).data

def _validated(serializer_class, request):
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data

class GrantableRolesView(BaseAPIView):
    """The roles the caller may give, each with the jurisdiction level it requires
    (`region`, `office`, `department`, or null), so that a form offers only what the
    backend will accept. Empty for a caller who grants no role."""
    def get(self, request):
        grantable = roles.grantable_roles(request.user)
        data = [
            {"role": value, "label": label, "jurisdiction": role_scope.required_level(value)}
            for value, label in Role.choices
            if value in grantable
        ]
        return api_response(data)

class ProvisionView(BaseAPIView):
    def post(self, request):
        user = provisioning.provision(
            request.user, **_validated(serializers.ProvisionInput, request)
        )
        return api_response(
            _render(user.pk),
            message="Account created. An invitation has been emailed to the user.",
            status=http.HTTP_201_CREATED,
        )

class ActivateView(BaseAPIView):
    """Public: the invited person follows the emailed link and chooses a password."""
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        data = _validated(serializers.ActivateInput, request)
        try:
            invitations.activate(**data)
        except DjangoValidationError as exc:
            raise drf_serializers.ValidationError({"new_password": exc.messages}) from None
        return api_response(None, message="Account activated. You can now log in.")

class _ManagedAccountView(BaseAPIView):
    """An action on an account the caller manages. Without the code the answer is 403;
    an account outside the caller's scope is 404, like one that does not exist."""
    def get_account(self):
        policy.require_code(self.request.user, Code.USER_MANAGE)
        return get_object_or_404(selectors.users_for(self.request.user), pk=self.kwargs["pk"])

class ResendInvitationView(_ManagedAccountView):
    def post(self, request, pk):
        invitations.resend(request.user, self.get_account())
        return api_response(
            None, message="A new invitation has been sent.", status=http.HTTP_202_ACCEPTED
        )

class RevokeInvitationView(_ManagedAccountView):
    def post(self, request, pk):
        invitations.revoke(request.user, self.get_account())
        return api_response(None, message="Invitation revoked.")

class RoleView(_ManagedAccountView):
    def post(self, request, pk):
        account = self.get_account()
        roles.set_role(request.user, account, **_validated(serializers.RoleInput, request))
        return api_response(_render(account.pk), message="Role updated successfully.")

class DeactivateView(_ManagedAccountView):
    def post(self, request, pk):
        account = self.get_account()
        management.deactivate(request.user, account, **_validated(serializers.ReasonInput, request))
        return api_response(_render(account.pk), message="Account deactivated.")

class ReactivateView(_ManagedAccountView):
    def post(self, request, pk):
        account = self.get_account()
        management.reactivate(request.user, account, **_validated(serializers.ReasonInput, request))
        return api_response(_render(account.pk), message="Account reactivated.")

class AppointmentCandidateListView(GenericListViewAPI):
    """`?region=<id>`: the accounts that can be appointed IT Asset Manager of that region.
    For a Chief of Service of Computing, another region's list is simply empty."""
    selector = selectors.it_asset_manager_candidates_for
    filterset_class = CandidateFilter
    search_fields = AccountListView.search_fields
    ordering_fields = ("email",)
    ordering = ("email",)
    output_serializer_class = serializers.AccountOutput

    def get_queryset(self):
        policy.require_code(self.request.user, Code.IT_ASSET_MANAGER_APPOINT)
        return super().get_queryset()

def _responsibility_account(request, pk, code):
    gate = Code.STORE_KEEPER_GRANT if code == "STORE_KEEPER" else Code.IT_ASSET_MANAGER_APPOINT
    policy.require_code(request.user, gate)
    return get_object_or_404(selectors.application_accounts(), pk=pk)

class ResponsibilityCreateView(BaseAPIView):
    def post(self, request, pk):
        data = _validated(serializers.ResponsibilityInput, request)
        code = data.pop("code")
        account = _responsibility_account(request, pk, code)
        if code == "STORE_KEEPER":
            responsibilities.grant_store_keeper(
                request.user, account, reason=data.get("reason", "")
            )
            message = "Store Keeper responsibility granted. Assign a warehouse to put it to use."
        else:
            replace = request.query_params.get("replace", "").lower() == "true"
            responsibilities.appoint_it_asset_manager(
                request.user, account, replace=replace, **data
            )
            message = "IT Asset Manager appointed successfully."
        return api_response(_render(account.pk), message=message, status=http.HTTP_201_CREATED)

class ResponsibilityDetailView(BaseAPIView):
    def delete(self, request, pk, code):
        if code not in ("STORE_KEEPER", "IT_ASSET_MANAGER"):
            return self.http_method_not_allowed(request)
        account = _responsibility_account(request, pk, code)
        reason = _validated(serializers.ReasonInput, request)
        if code == "STORE_KEEPER":
            responsibilities.revoke_store_keeper(request.user, account, **reason)
            return api_response(
                None,
                message="Store Keeper responsibility ended. Any warehouse they kept is vacant.",
            )
        responsibilities.revoke_it_asset_manager(request.user, account, **reason)
        return api_response(None, message="IT Asset Manager appointment ended.")

class _AccountScoped:
    """Jurisdictions are managed by administrators only."""
    def get_account(self):
        policy.require(self.request.user, Code.JURISDICTION_MANAGE)
        return get_object_or_404(selectors.users_for(self.request.user), pk=self.kwargs["pk"])

class JurisdictionListCreateView(_AccountScoped, GenericListCreateViewAPI):
    filterset_class = JurisdictionFilter
    ordering_fields = ("granted_at",)
    ordering = ("-granted_at",)
    input_serializer_class = serializers.JurisdictionInput
    output_serializer_class = serializers.JurisdictionOutput
    create_service = jurisdictions.grant
    success_messages = {"POST": "Jurisdiction granted successfully."}

    def get_queryset(self):
        return selectors.jurisdictions_of(self.get_account())

    def get_service_kwargs(self):
        return {"user": self.get_account()}

class JurisdictionDetailView(_AccountScoped, BaseAPIView):
    def delete(self, request, pk, jurisdiction_id):
        queryset = selectors.jurisdictions_of(self.get_account())
        jurisdiction = get_object_or_404(queryset, pk=jurisdiction_id)
        jurisdictions.end(request.user, jurisdiction)
        return api_response(None, message="Jurisdiction ended successfully.")
