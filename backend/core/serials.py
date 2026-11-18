def normalize_serial(serial_number):
    """Strip, upper-case and remove inner whitespace; None when there is no serial."""
    return "".join((serial_number or "").split()).upper() or None
