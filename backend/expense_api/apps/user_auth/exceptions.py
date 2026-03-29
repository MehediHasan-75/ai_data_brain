class UserAuthException(Exception):
    pass


class InvalidCredentials(UserAuthException):
    pass


class UserNotFound(UserAuthException):
    pass


class DuplicateEmail(UserAuthException):
    pass


class DuplicateUsername(UserAuthException):
    pass


class PasswordMismatch(UserAuthException):
    pass


class WrongCurrentPassword(UserAuthException):
    pass


class AlreadyFriends(UserAuthException):
    pass


class NotFriends(UserAuthException):
    pass


class UserNotInFriendsList(UserAuthException):
    pass
