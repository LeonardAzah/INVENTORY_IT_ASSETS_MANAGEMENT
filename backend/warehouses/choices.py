from django.db import models

class WarehouseType(models.TextChoices):
    GENERAL = "GENERAL", "General"
    IT = "IT", "IT"