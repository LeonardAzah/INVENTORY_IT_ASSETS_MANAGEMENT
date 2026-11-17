from django.apps import AppConfig

class EmployeesConfig(AppConfig):
    name = 'employees'
    label = "employees"

    def ready(self):
        from core.api.exceptions import register_constraint_error

        from . import models

        register_constraint_error(
            models.MATRICULE_UNIQUE,
            "MATRICULE_IN_USE",
            "An employee with this matricule exists.",
        )
        register_constraint_error(
            models.EMAIL_UNIQUE,
            "EMPLOYEE_EMAIL_IN_USE",
            "An employee with this email exists.",
        )