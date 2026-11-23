from dataclasses import dataclass

from django.db.models import Q
from django.utils import timezone

from accounts import policy
from accounts.policy import Code
from assets.models import AssetAssignment, AssetEvent, ITAsset
from audit.models import AuditLog
from core.quantities import fmt
from inventory import selectors as inventory_selectors
from inventory.models import InventoryBalance, InventoryTransaction, StockAdjustment
from inventory.services import thresholds

from . import filters

@dataclass(frozen=True)
class Report:
    name: str
    title: str
    description: str
    code: Code
    columns: tuple 
    filterset: type
    queryset: callable 
    row: callable 
    ordering: tuple

def when(moment):
    """A timestamp in local time, to the minute."""
    return timezone.localtime(moment).strftime("%Y-%m-%d %H:%M") if moment else ""

def person(employee):
    return f"{employee.first_name} {employee.last_name} ({employee.matricule})" if employee else ""

def assignee(assignment):
    if assignment is None:
        return ""
    if assignment.employee_id:
        return person(assignment.employee)
    if assignment.department_id:
        return f"{assignment.department.name} (department)"
    return f"{assignment.location.name} (location)"

def _stock(queryset):
    return lambda user: inventory_selectors.scoped(queryset, user, Code.REPORT_VIEW_INVENTORY)

def _asset_scope(user, prefix=""):
    context = policy.context_for(user)
    if Code.REPORT_VIEW_ASSETS not in context.codes:
        return None
    if context.sees_organization:
        return Q()
    return Q(**{f"{prefix}region_id__in": context.it_regions}) | policy.jurisdiction_q(
        context, f"{prefix}location__"
    )

def _assets(queryset, prefix=""):
    def scoped(user):
        scope = _asset_scope(user, prefix)
        return queryset.none() if scope is None else queryset.filter(scope)

    return scoped

def _audit(user):
    return AuditLog.objects.select_related("actor")

def stock_row(balance):
    item, threshold = balance.item, balance.low_stock_threshold
    return {
        "warehouse": balance.warehouse.code,
        "item_code": item.code,
        "item": item.name,
        "category": item.category.name,
        "unit": item.unit.code,
        "on_hand": fmt(balance.quantity_on_hand),
        "unavailable": fmt(balance.quantity_unavailable),
        "available": fmt(thresholds.available(balance)),
        "threshold": fmt(threshold) if threshold is not None else "",
        "low_stock": "Yes" if balance.low_stock_alerted else "",
        "last_movement": when(balance.last_movement_at),
    }

def movement_row(entry):
    return {
        "date": when(entry.occurred_at),
        "warehouse": entry.warehouse.code,
        "reference": entry.reference,
        "type": entry.get_type_display(),
        "item_code": entry.item.code,
        "item": entry.item.name,
        "quantity": fmt(entry.quantity_delta),
        "unavailable": fmt(entry.unavailable_delta),
        "on_hand_after": fmt(entry.on_hand_after),
        "by": entry.actor.email,
    }

def adjustment_row(adjustment):
    line = adjustment.stock_take_line
    return {
        "date": when(adjustment.created_at),
        "reference": adjustment.reference,
        "warehouse": adjustment.warehouse.code,
        "item_code": adjustment.item.code,
        "item": adjustment.item.name,
        "kind": adjustment.get_kind_display(),
        "change": fmt(adjustment.quantity_delta),
        "previous": fmt(adjustment.previous_on_hand),
        "resulting": fmt(adjustment.resulting_on_hand),
        "stock_take": line.stock_take.reference if line else "",
        "reason": adjustment.reason,
        "by": adjustment.created_by.email,
    }

def asset_row(asset):
    return {
        "asset_tag": asset.asset_tag,
        "item": asset.item.name,
        "asset_class": asset.item.get_asset_class_display(),
        "brand": asset.item.brand,
        "model": asset.item.model,
        "serial_number": asset.serial_number,
        "status": asset.get_status_display(),
        "region": asset.region.code,
        "where": asset.location.name if asset.location else _warehouse(asset),
        "assignee": assignee(asset.current_assignment),
        "source": asset.get_source_display(),
        "registered": when(asset.registered_at),
    }

def _warehouse(asset):
    warehouse = asset.custody_warehouse
    return f"IT warehouse {warehouse.code}" if warehouse else ""

def location_row(asset):
    location = asset.location
    return {
        "region": asset.region.code,
        "office": location.office.name if location else "",
        "location": location.name if location else _warehouse(asset),
        "asset_tag": asset.asset_tag,
        "item": asset.item.name,
        "asset_class": asset.item.get_asset_class_display(),
        "status": asset.get_status_display(),
        "assignee": assignee(asset.current_assignment),
    }

def assignment_row(assignment):
    asset = assignment.asset
    return {
        "asset_tag": asset.asset_tag,
        "item": asset.item.name,
        "serial_number": asset.serial_number,
        "assignee_type": assignment.get_assignee_type_display(),
        "assignee": assignee(assignment),
        "location": assignment.location.name,
        "assigned_at": when(assignment.assigned_at),
        "assigned_by": assignment.assigned_by.email,
        "returned_at": when(assignment.returned_at),
        "return_condition": assignment.return_condition,
    }

def lifecycle_row(event):
    return {
        "date": when(event.occurred_at),
        "asset_tag": event.asset.asset_tag,
        "item": event.asset.item.name,
        "event": event.get_event_type_display(),
        "from_status": event.from_status,
        "to_status": event.to_status,
        "reason": event.reason,
        "by": event.actor.email,
    }

def audit_row(entry):
    return {
        "date": when(entry.occurred_at),
        "actor": entry.actor_repr,
        "action": entry.action,
        "object_type": entry.object_type,
        "object": entry.object_repr,
        "ip": entry.ip or "",
        "request_id": str(entry.request_id) if entry.request_id else "",
    }

def columns(*pairs):
    return tuple(pairs)

_ASSETS = ITAsset.objects.select_related(
    "item",
    "region",
    "location__office",
    "custody_warehouse",
    "current_assignment__employee",
    "current_assignment__department",
    "current_assignment__location",
)

REPORTS = {
    report.name: report
    for report in (
        Report(
            name="warehouse-stock",
            title="Warehouse Stock Report",
            description="What each warehouse holds now, item by item.",
            code=Code.REPORT_VIEW_INVENTORY,
            columns=columns(
                ("warehouse", "Warehouse"),
                ("item_code", "Item code"),
                ("item", "Item"),
                ("category", "Category"),
                ("unit", "Unit"),
                ("on_hand", "On hand"),
                ("unavailable", "Unavailable"),
                ("available", "Available"),
                ("threshold", "Threshold"),
                ("low_stock", "Low stock"),
                ("last_movement", "Last movement"),
            ),
            filterset=filters.StockReportFilter,
            queryset=_stock(
                InventoryBalance.objects.select_related("warehouse", "item__unit", "item__category")
            ),
            row=stock_row,
            ordering=("warehouse__code", "item__code"),
        ),
        Report(
            name="inventory-movements",
            title="Inventory Movement Report",
            description="Every stock movement, by posting time (not by document date).",
            code=Code.REPORT_VIEW_INVENTORY,
            columns=columns(
                ("date", "Posted"),
                ("warehouse", "Warehouse"),
                ("reference", "Reference"),
                ("type", "Type"),
                ("item_code", "Item code"),
                ("item", "Item"),
                ("quantity", "Quantity"),
                ("unavailable", "Unavailable"),
                ("on_hand_after", "On hand after"),
                ("by", "By"),
            ),
            filterset=filters.MovementReportFilter,
            queryset=_stock(
                InventoryTransaction.objects.select_related("warehouse", "item", "actor")
            ),
            row=movement_row,
            ordering=("occurred_at", "id"),
        ),
        Report(
            name="stock-adjustments",
            title="Stock-Taking and Adjustment Report",
            description="Corrections to stock, with their reasons and the count they came from.",
            code=Code.REPORT_VIEW_INVENTORY,
            columns=columns(
                ("date", "Date"),
                ("reference", "Reference"),
                ("warehouse", "Warehouse"),
                ("item_code", "Item code"),
                ("item", "Item"),
                ("kind", "Kind"),
                ("change", "Change"),
                ("previous", "Before"),
                ("resulting", "After"),
                ("stock_take", "Stock-take"),
                ("reason", "Reason"),
                ("by", "By"),
            ),
            filterset=filters.AdjustmentReportFilter,
            queryset=_stock(
                StockAdjustment.objects.select_related(
                    "warehouse", "item", "created_by", "stock_take_line__stock_take"
                )
            ),
            row=adjustment_row,
            ordering=("created_at", "reference"),
        ),
        Report(
            name="asset-register",
            title="IT Asset Register",
            description="Every IT asset with its identity, status and where it is.",
            code=Code.REPORT_VIEW_ASSETS,
            columns=columns(
                ("asset_tag", "Asset tag"),
                ("item", "Item"),
                ("asset_class", "Class"),
                ("brand", "Brand"),
                ("model", "Model"),
                ("serial_number", "Serial"),
                ("status", "Status"),
                ("region", "Region"),
                ("where", "Location"),
                ("assignee", "Assigned to"),
                ("source", "Source"),
                ("registered", "Registered"),
            ),
            filterset=filters.AssetRegisterFilter,
            queryset=_assets(_ASSETS),
            row=asset_row,
            ordering=("asset_tag",),
        ),
        Report(
            name="asset-assignments",
            title="Asset Assignment Report",
            description="Who was given which asset, when, and when it came back.",
            code=Code.REPORT_VIEW_ASSETS,
            columns=columns(
                ("asset_tag", "Asset tag"),
                ("item", "Item"),
                ("serial_number", "Serial"),
                ("assignee_type", "Assigned to"),
                ("assignee", "Assignee"),
                ("location", "Location"),
                ("assigned_at", "Assigned"),
                ("assigned_by", "By"),
                ("returned_at", "Returned"),
                ("return_condition", "Condition on return"),
            ),
            filterset=filters.AssignmentReportFilter,
            queryset=_assets(
                AssetAssignment.objects.select_related(
                    "asset__item", "employee", "department", "location", "assigned_by"
                ),
                "asset__",
            ),
            row=assignment_row,
            ordering=("-assigned_at", "id"),
        ),
        Report(
            name="asset-locations",
            title="Asset Location Report",
            description="Assets grouped by where they are, including the IT warehouse.",
            code=Code.REPORT_VIEW_ASSETS,
            columns=columns(
                ("region", "Region"),
                ("office", "Office"),
                ("location", "Location"),
                ("asset_tag", "Asset tag"),
                ("item", "Item"),
                ("asset_class", "Class"),
                ("status", "Status"),
                ("assignee", "Assigned to"),
            ),
            filterset=filters.AssetLocationFilter,
            queryset=_assets(_ASSETS),
            row=location_row,
            ordering=("region__code", "location__office__name", "location__name", "asset_tag"),
        ),
        Report(
            name="asset-lifecycle",
            title="Asset Lifecycle Report",
            description="The events in the life of assets: registration, status changes, moves.",
            code=Code.REPORT_VIEW_ASSETS,
            columns=columns(
                ("date", "Date"),
                ("asset_tag", "Asset tag"),
                ("item", "Item"),
                ("event", "Event"),
                ("from_status", "From"),
                ("to_status", "To"),
                ("reason", "Reason"),
                ("by", "By"),
            ),
            filterset=filters.LifecycleReportFilter,
            queryset=_assets(AssetEvent.objects.select_related("asset__item", "actor"), "asset__"),
            row=lifecycle_row,
            ordering=("occurred_at", "id"),
        ),
        Report(
            name="audit",
            title="Audit Report",
            description="Who did what, and when.",
            code=Code.AUDIT_VIEW,
            columns=columns(
                ("date", "Date"),
                ("actor", "Actor"),
                ("action", "Action"),
                ("object_type", "Object type"),
                ("object", "Object"),
                ("ip", "Address"),
                ("request_id", "Request"),
            ),
            filterset=filters.AuditReportFilter,
            queryset=_audit,
            row=audit_row,
            ordering=("occurred_at", "id"),
        ),
    )
}
