from .models import Department, Location, Office, Region

def regions_for(user):
    return Region.objects.all()

def offices_for(user):
    return Office.objects.select_related("region", "parent")

def departments_for(user):
    return Department.objects.select_related("region", "office")

def locations_for(user):
    return Location.objects.select_related("region", "office", "department")
