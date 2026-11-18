from django.urls import path

from . import views

account = "accounts/<uuid:pk>/"

urlpatterns = [
    path("auth/jwt/create/", views.TokenObtainPairView.as_view(), name="jwt-create"),
    path("auth/jwt/refresh/", views.TokenRefreshView.as_view(), name="jwt-refresh"),
    path("auth/jwt/verify/", views.TokenVerifyView.as_view(), name="jwt-verify"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/users/me/", views.CurrentUserView.as_view({"get": "me"}), name="user-me"),
    path(
        "auth/users/set_password/",
        views.SetPasswordView.as_view({"post": "set_password"}),
        name="user-set-password",
    ),
    path(
        "auth/users/reset_password/",
        views.ResetPasswordView.as_view({"post": "reset_password"}),
        name="user-reset-password",
    ),
    path(
        "auth/users/reset_password_confirm/",
        views.ResetPasswordConfirmView.as_view({"post": "reset_password_confirm"}),
        name="user-reset-password-confirm",
    ),
    path("accounts/", views.AccountListView.as_view(), name="account-list"),
    path("accounts/provision/", views.ProvisionView.as_view(), name="account-provision"),
    path(
        "accounts/grantable-roles/",
        views.GrantableRolesView.as_view(),
        name="account-grantable-roles",
    ),
    path("accounts/activate/", views.ActivateView.as_view(), name="account-activate"),
    path(
        "accounts/it-asset-manager-candidates/",
        views.AppointmentCandidateListView.as_view(),
        name="account-it-asset-manager-candidates",
    ),
    path(account, views.AccountDetailView.as_view(), name="account-detail"),
    path(
        f"{account}resend-invitation/",
        views.ResendInvitationView.as_view(),
        name="account-resend-invitation",
    ),
    path(
        f"{account}revoke-invitation/",
        views.RevokeInvitationView.as_view(),
        name="account-revoke-invitation",
    ),
    path(f"{account}role/", views.RoleView.as_view(), name="account-role"),
    path(f"{account}deactivate/", views.DeactivateView.as_view(), name="account-deactivate"),
    path(f"{account}reactivate/", views.ReactivateView.as_view(), name="account-reactivate"),
    path(
        f"{account}responsibilities/",
        views.ResponsibilityCreateView.as_view(),
        name="account-responsibility-list",
    ),
    path(
        f"{account}responsibilities/<str:code>/",
        views.ResponsibilityDetailView.as_view(),
        name="account-responsibility-detail",
    ),
    path(
        f"{account}jurisdictions/",
        views.JurisdictionListCreateView.as_view(),
        name="account-jurisdiction-list",
    ),
    path(
        f"{account}jurisdictions/<uuid:jurisdiction_id>/",
        views.JurisdictionDetailView.as_view(),
        name="account-jurisdiction-detail",
    ),
]
