from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("reports/", views.ReportListView.as_view(), name="report-list"),
    path("reports/<slug:name>/", views.ReportView.as_view(), name="report"),
    path("audit/", views.AuditListView.as_view(), name="audit-list"),
    path("notifications/", views.NotificationListView.as_view(), name="notification-list"),
    path(
        "notifications/<uuid:pk>/retry/",
        views.NotificationRetryView.as_view(),
        name="notification-retry",
    ),
]
