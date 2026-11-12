class DomainError():
    """Broken service rule"""
    status_code = 409

    def __init__(self, error_code, message, *, context=None, status_code=None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.context = context or {}
        if status_code is not None:
            self.status_code = status_code