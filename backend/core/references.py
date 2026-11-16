from django.db import connection

from .models import DocumentSequence

# Sequences that never restart use this in place of a year.
NO_YEAR = 0

def next_number(doc_type, scope_key, year=NO_YEAR):
    """The next number of a sequence. Must run inside the transaction that uses it: if
    that transaction rolls back, so does the number, which keeps the series gapless."""
    table = DocumentSequence._meta.db_table
    with connection.cursor() as cursor:
        cursor.execute(
            f"INSERT INTO {table} (doc_type, scope_key, year, last_number) "  # noqa: S608
            "VALUES (%s, %s, %s, 0) ON CONFLICT DO NOTHING",
            [doc_type, scope_key, year],
        )
    sequence = DocumentSequence.objects.select_for_update().get(
        doc_type=doc_type, scope_key=scope_key, year=year
    )
    sequence.last_number += 1
    sequence.save(update_fields=["last_number"])
    return sequence.last_number

def document_reference(doc_type, scope_key, year):
    """`{TYPE}-{SCOPE}-{YYYY}-{NNNNNN}`, numbered per scope and year."""
    return f"{doc_type}-{scope_key}-{year}-{next_number(doc_type, scope_key, year):06d}"

def asset_tag(region_code):
    """`{REGION}-IT-{NNNNNN}`. Never restarts."""
    return f"{region_code}-IT-{next_number('TAG', region_code):06d}"
