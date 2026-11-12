import uuid

from django.db import models

class UUIDModel(models.Model):
    """Base for every domain model: UUID v4 primary key."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True

class DocumentSequence(models.Model):
    """The last number handed out for one kind of document, in one scope, in one year.
    Only `core.references.next_number` writes it, under a raw lock, so numbers are gapless."""

    doc_type = models.CharField(max_length=8)
    scope_key = models.CharField(max_length=32)
    year = models.PositiveSmallIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        default_permissions = ()
        constraints = [
            models.UniqueConstraint(
                fields=["doc_type", "scope_key", "year"],
                name="core_documentsequence_unique"
            ),
        ]

    def __str__(self):
        return f"{self.doc_type}-{self.scope_key}-{self.year}: {self.last_number}"