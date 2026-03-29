# user_auth App — Architecture Reference

## Purpose

Handles all user identity for the project: registration, login/logout, JWT
token lifecycle, profile updates, and a bidirectional friends system that
the FinanceManagement sharing feature depends on.

---

## Folder Structure

```
expense_api/apps/user_auth/
├── models.py        — UserProfile (extends Django User)
├── authentication.py — JWT encode/decode + IsAuthenticatedCustom permission
├── permission.py    — JWTAuthentication (reads token from cookie)
├── serializers.py   — UserSerializer, userRegisterSerializer, UserProfileSerializer
├── views.py         — 11 view classes
└── urls.py          — 11 URL patterns under /api/auth/
```

---

## Models

### UserProfile

Extends Django's built-in `auth_user` with a friends list.

```
user_auth_userprofile
┌─────────────┬──────────────────────────────────────────────────┐
│ id          │ PK, auto (BigAutoField)                          │
│ user_id     │ FK → auth_user.id  (OneToOne, CASCADE)           │
│ created_at  │ DateTimeField, auto_now_add                      │
│ updated_at  │ DateTimeField, auto_now                          │
└─────────────┴──────────────────────────────────────────────────┘

user_auth_userprofile_friends  (auto M2M join)
┌──────────────────┬────────────────────────────────────────────┐
│ userprofile_id   │ FK → user_auth_userprofile.id              │
│ user_id          │ FK → auth_user.id                          │
└──────────────────┴────────────────────────────────────────────┘
```

**Important:** `UserProfile` is **not** auto-created on user registration.
It is created lazily in `FriendsListView` and `ManageFriendView` when accessed:
```python
if not hasattr(user, 'profile'):
    UserProfile.objects.create(user=user)
```

---

## Authentication System

### Token Flow

Two custom JWT tokens — no Django sessions involved.

```
Login / Register
      │
      ▼
generate_access_token(user)    → JWT, expires 60 min, signed with 'secret'
generate_refresh_token(user)   → JWT, expires 7 days, signed with 'secret'
      │
      ▼
Set as HttpOnly cookies
  access_token   — httponly, SameSite=Lax, max_age=3600
  refresh_token  — httponly, SameSite=Lax, max_age=604800
```

**JWT payload shape (both tokens)**
```json
{
  "user_id": 42,
  "exp": "<timestamp>",
  "iat": "<timestamp>"
}
```

### `authentication.py`

| Function | Purpose |
|---|---|
| `generate_access_token(user)` | Creates 60-min JWT |
| `generate_refresh_token(user)` | Creates 7-day JWT |
| `decode_access_token(token)` | Returns `user_id` or raises `AuthenticationFailed` |
| `decode_refresh_token(token)` | Returns `user_id` or raises `AuthenticationFailed` |
| `IsAuthenticatedCustom` | DRF permission: passes if `request.user` is authenticated |

### `permission.py` — `JWTAuthentication`

DRF `BaseAuthentication` subclass. Called automatically by DRF on every
protected request.

```python
def authenticate(self, request):
    token = request.COOKIES.get('access_token')
    if not token:
        return None                          # anonymous — let permission class handle it
    user_id = decode_access_token(token)
    user = User.objects.get(id=user_id)
    return (user, None)                      # sets request.user
```

Token is read from the **HttpOnly cookie**, never from the Authorization header.

### Token Refresh

`GET /api/auth/updateAcessToken/` — no auth required (uses refresh cookie):
1. Reads `refresh_token` cookie
2. Decodes to get `user_id`
3. Issues a new `access_token` cookie (60 min)

---

## Serializers

| Serializer | Model | Fields | Purpose |
|---|---|---|---|
| `UserSerializer` | User | id, username, email, first_name, last_name | Read-only user data |
| `userRegisterSerializer` | User | id, username, email, password (write-only), first_name, last_name | Creates user via `create_user()` (hashes password) |
| `UserProfileSerializer` | UserProfile | id, user (nested), friends (computed) | Profile view — `get_friends` reads from both M2M directions |

---

## API Endpoints

Base path: `/api/auth/`

| Method | URL | View | Auth required | What it does |
|---|---|---|---|---|
| POST | `register/` | `UserRegisterView` | No | Create user + set both cookies |
| POST | `login/` | `loginView` | No | Authenticate + set both cookies |
| POST | `logout/` | `logoutView` | Yes | Delete both cookies |
| GET | `me/` | `MeView` | Yes | Return `request.user` data |
| GET | `users-list/` | `UserListView` | Yes | List all users |
| GET | `users-list/<user_id>/` | `UserDetailView` | Yes | Get one user by ID |
| POST | `update/` | `UpdateUserDetails` | Yes | Change password (verify old first) |
| POST | `update-profile/` | `UpdateUserProfile` | Yes | Change email or username |
| GET | `updateAcessToken/` | `UdateAccessToken` | No (uses refresh cookie) | Issue new access token |
| GET | `friends/` | `FriendsListView` | Yes | List friends (both directions) |
| POST | `friends/manage/` | `ManageFriendView` | Yes | Add or remove a friend |

---

## How Key Views Work

### UserRegisterView — POST `register/`
1. Validates with `userRegisterSerializer`
2. Calls `User.objects.create_user()` (hashes password)
3. Generates both tokens
4. Sets `access_token` + `refresh_token` as HttpOnly cookies
5. Returns user data + both tokens in response body

### loginView — POST `login/`
1. `django.contrib.auth.authenticate(username, password)`
2. If valid: generates tokens, sets cookies, returns user data
3. If invalid: returns `{"message": "Invalid credentials."}`

### UdateAccessToken — GET `updateAcessToken/`
No `JWTAuthentication` on this view (access token may be expired).
Reads the refresh cookie directly, issues a new access token.
This is what the frontend should call when it receives a 401.

### FriendsListView — GET `friends/`

Friends are **directional** in the DB (A adds B, but B didn't add A).
This view makes it bidirectional for display:

```python
user_friends = user.profile.friends.all()           # people I added
friends_who_added_me = User.objects.filter(         # people who added me
    profile__friends=user
)
```

Each entry includes `added_by_me: true/false` so the frontend
knows whether the current user can remove that friendship.

### ManageFriendView — POST `friends/manage/`

```
action: "add"
  → Check not already friends in either direction
  → user.profile.friends.add(friend)

action: "remove"
  → Only allowed if YOU added THEM (not the other way)
  → user.profile.friends.remove(friend)
```

Auto-creates `UserProfile` for both sides if missing.

### UpdateUserDetails — POST `update/`
Password change flow:
1. Find user by `email` or `username`
2. `authenticate(username, old_password)` — must succeed
3. `user.set_password(new_password)` + `user.save()`

### UpdateUserProfile — POST `update-profile/`
Email/username change:
1. Verify current password with `authenticate()`
2. Check new email/username is not already taken
3. Save changes

---

## Friends System and Table Sharing

`UserProfile.friends` is a directional M2M. The sharing feature in
`FinanceManagement` treats the relationship as bidirectional:

```python
# In ShareTableView (FinanceManagement)
user_friends = current_user.profile.friends.all()
friends_who_added_me = User.objects.filter(profile__friends=current_user)
all_friends = user_friends.union(friends_who_added_me)
```

A table can only be shared with someone who is a friend in **either direction**.

---

## Used By Other Apps

Both `FinanceManagement/views.py` and `agent/views.py` import directly from this app:

```python
from ..user_auth.authentication import IsAuthenticatedCustom, decode_refresh_token, ...
from ..user_auth.permission import JWTAuthentication
```

Every protected view in the project uses `JWTAuthentication` + `IsAuthenticatedCustom`
as its authentication/permission pair.
