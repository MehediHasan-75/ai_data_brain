class FinanceException(Exception):
    pass


class TableNotFound(FinanceException):
    pass


class PermissionDenied(FinanceException):
    pass


class RowNotFound(FinanceException):
    pass


class DuplicateHeader(FinanceException):
    pass


class InvalidRowData(FinanceException):
    pass


class NotAFriend(FinanceException):
    pass


class AlreadyShared(FinanceException):
    pass


class NotShared(FinanceException):
    pass
