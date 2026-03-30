# Authentication System — A Complete Guide

This document explains every piece of the authentication system: how JWTs are created, where they live, how each request is verified, and why every design decision was made this way.

---

## Table of Contents

- [The Big Picture](#the-big-picture)
- [Why HttpOnly Cookies Instead of LocalStorage](#why-httponly-cookies-instead-of-localstorage)
- [JWT Anatomy: What's Inside the Token](#jwt-anatomy-whats-inside-the-token)
- [The Token Lifecycle: Register → Login → Request → Refresh → Logout](#the-token-lifecycle)
- [The Two-File Auth System](#the-two-file-auth-system)
- [How Django Knows Who You Are on Every Request](#how-django-knows-who-you-are-on-every-request)
- [The UserProfile Model: Extending Django's Built-in User](#the-userprofile-model)
- [The Friends System](#the-friends-system)
- [Service Layer: AuthService and UserService](#service-layer)
- [API Endpoints Reference](#api-endpoints-reference)
- [Security Model](#security-model)
- [Common Errors](#common-errors)

---

## The Big Picture

```
Browser sends request
        │
        │  Cookie: access_token=eyJhbG...
        ▼
  JWTAuthentication.authenticate()
        │  reads cookie, decodes JWT, loads User from DB
        ▼
  IsAuthenticatedCustom.has_permission()
        │  checks user is not None and is_authenticated
        ▼
  View / Service receives request.user
```

Every protected endpoint follows this exact flow. The auth system is **stateless** — the server never stores sessions. All user identity information lives inside the signed JWT token in the browser's cookie jar.

---

## Why HttpOnly Cookies Instead of LocalStorage

Most JWT tutorials tell you to store the token in `localStorage` and send it as an `Authorization: Bearer <token>` header. This project does something smarter.

**The problem with `localStorage`:**
JavaScript running on your page — including any third-party scripts, browser extensions, or injected ads — can read `localStorage`. This means a single XSS (Cross-Site Scripting) vulnerability anywhere on the page gives an attacker your token. Token theft is game over: the attacker can impersonate you until the token expires.

**The HttpOnly cookie solution:**
An HttpOnly cookie is set by the server and is completely invisible to JavaScript. No `document.cookie` read, no `localStorage` access — the browser silently attaches it to every matching request, and JavaScript cannot touch it. Even if someone injects a malicious script into your page, they cannot steal the token.

```python
# services.py — how cookies are set
response.set_cookie(
    'access_token', access_token,
    httponly=True,          # JavaScript cannot read this
    path='/',               # sent on all paths
    samesite='Lax',         # not sent on cross-site POSTs (CSRF protection)
    secure=not settings.DEBUG,  # HTTPS-only in production
    max_age=60 * 60,        # expires in 1 hour
)
```

**The trade-off:** HttpOnly cookies require CORS to be configured properly (`CORS_ALLOW_CREDENTIALS = True`) and the frontend must send `credentials: "include"` with every fetch. It also means JavaScript cannot manually attach the token — it relies on the browser doing it automatically.

---

## JWT Anatomy: What's Inside the Token

A JWT (JSON Web Token) looks like three Base64-encoded strings joined by dots:

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.HMAC_signature
     ^                      ^                      ^
  Header (alg)          Payload (claims)       Signature
```

**Our token payload:**
```python
payload = {
    'user_id': user.id,                              # who this token is for
    'exp': datetime.utcnow() + timedelta(minutes=60), # expires in 1 hour
    'iat': datetime.datetime.utcnow(),               # issued at
}
```

**The signature:**
```python
jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
```

The signature is a cryptographic MAC (Message Authentication Code) computed over the header + payload using `SECRET_KEY`. If anyone tampers with the payload (e.g., changing `user_id` from `5` to `1`), the signature check fails and the token is rejected. This is why `SECRET_KEY` must be long, random, and secret — it is the backbone of the entire auth system.

**Access token vs Refresh token:**
- **Access token** — expires in 1 hour. Used on every authenticated request. Short-lived to limit damage if intercepted.
- **Refresh token** — expires in 1 day. Used only to get a new access token. The browser calls `GET /api/auth/updateAcessToken/` with the refresh cookie; the server issues a fresh access token without re-asking for the password.

```
Access token expires  →  Browser sends refresh cookie to /updateAcessToken/
                      →  Server verifies refresh token
                      →  Server issues new access token
                      →  User never sees a "session expired" error
```

---

## The Token Lifecycle

### 1. Registration

```
POST /api/auth/register/
  Body: { username, email, password, first_name, last_name }

  → userRegisterSerializer validates the input
  → User.objects.create_user() hashes the password (Django's built-in PBKDF2)
  → generate_access_token() + generate_refresh_token() create JWTs
  → set_auth_cookies() writes both to the response as HttpOnly cookies
  → Response: { message, user: { id, username, email, ... } }
```

Django's `create_user()` uses PBKDF2-SHA256 with 720,000 iterations by default. The raw password is never stored anywhere. You can verify a password but you can never decrypt it back.

### 2. Login

```
POST /api/auth/login/
  Body: { username, password }

  → Django's authenticate(username, password) runs the PBKDF2 check
  → If credentials wrong: 401 Unauthorized
  → If correct: same token generation + cookie setting as registration
```

### 3. Authenticated Request

```
GET /api/auth/me/   (or any protected endpoint)
  Cookie: access_token=eyJhbG...

  → JWTAuthentication reads the cookie
  → decode_access_token() verifies signature and expiry
  → User.objects.get(id=user_id) loads the full User object
  → request.user is now the authenticated User
  → View runs its logic
```

### 4. Token Refresh

```
GET /api/auth/updateAcessToken/
  Cookie: refresh_token=eyJhbG...

  → decode_refresh_token() verifies the refresh token
  → A new access token is generated
  → set_access_cookie() writes only the access token cookie
  → The refresh token is unchanged (it still has remaining lifetime)
```

### 5. Logout

```
POST /api/auth/logout/
  Cookie: access_token=...

  → clear_auth_cookies() calls response.delete_cookie() for both tokens
  → The browser's cookie jar is cleared
  → Future requests have no token → treated as unauthenticated
```

**Important:** Because JWTs are stateless, the old token is technically still valid until it expires. True token revocation requires a server-side blacklist (a table of invalidated `jti` values). This project does not implement that — logout clears the client cookie, but a captured token would still work until expiry. For most applications this is acceptable; for high-security use cases, add a Redis-backed token blacklist.

---

## The Two-File Auth System

The auth logic is split across two files that work together.

### `authentication.py` — JWT operations + the permission class

This file has three responsibilities:

**1. `generate_access_token(user)` and `generate_refresh_token(user)`**
Create and sign JWT tokens using `settings.SECRET_KEY`. The access token payload contains only `user_id`, `exp`, and `iat` — the minimum needed to identify and validate the session.

**2. `decode_access_token(token)` and `decode_refresh_token(token)`**
Verify the signature and parse the payload. If the token was tampered with or expired, `jwt.InvalidTokenError` or `jwt.ExpiredSignatureError` is raised — each caught specifically so error messages are clear.

```python
def decode_access_token(token):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        return payload['user_id']
    except jwt.ExpiredSignatureError:
        raise exceptions.AuthenticationFailed('Token has expired')
    except jwt.InvalidTokenError:
        raise exceptions.AuthenticationFailed('Invalid token')
```

Why catch them separately? So you can give the client a useful message: "expired" means "please refresh your token", while "invalid" means "this token is malformed or forged."

**3. `IsAuthenticatedCustom(BasePermission)`**
This is Django REST Framework's permission class. It answers one question: "Is this user allowed to proceed?"

```python
class IsAuthenticatedCustom(BasePermission):
    def has_permission(self, request, view):
        return request.user is not None and request.user.is_authenticated
```

If `JWTAuthentication` set `request.user` to a valid User object, `is_authenticated` is `True`. If the cookie was missing or invalid, `request.user` is `AnonymousUser`, and `is_authenticated` is `False`.

### `permission.py` — The DRF authentication backend

This file contains `JWTAuthentication` — the class that reads the cookie and converts it into a User object.

```python
class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get('access_token')
        if not token:
            return None  # no cookie → let other backends try

        try:
            user_id = decode_access_token(token)
            user = User.objects.get(id=user_id)
            return (user, None)  # DRF expects (user, auth) tuple
        except Exception:
            raise AuthenticationFailed("Invalid or expired token")
```

**Why return `None` when there is no cookie?** DRF allows multiple authentication backends. Returning `None` means "I don't recognize this request — try the next backend." Only raising an exception means "I found a token but it's wrong." This distinction matters: a missing cookie is not an error, it's just an unauthenticated request.

**The two classes must be used together on every view:**
```python
class MyProtectedView(APIView):
    authentication_classes = [JWTAuthentication]   # "how to read the token"
    permission_classes = [IsAuthenticatedCustom]   # "is this token valid?"
```

`authentication_classes` runs first and sets `request.user`. `permission_classes` runs second and decides whether to allow the request through.

---

## How Django Knows Who You Are on Every Request

Here is the exact sequence every time a cookie arrives at a protected endpoint:

```
1. Browser sends: Cookie: access_token=eyJhbG...

2. Django's middleware pipeline runs

3. DRF calls JWTAuthentication.authenticate(request)
   ├── reads request.COOKIES.get('access_token')
   ├── calls decode_access_token(token)
   │   ├── jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
   │   └── returns user_id from payload
   └── User.objects.get(id=user_id)
       └── returns the User object

4. DRF sets request.user = <that User object>

5. DRF calls IsAuthenticatedCustom.has_permission(request, view)
   └── returns request.user.is_authenticated  →  True

6. View runs. request.user is the authenticated user.
   You can do: request.user.id, request.user.email, etc.
```

If any step fails (missing cookie, expired token, user deleted from DB), DRF returns a 401 or 403 before the view ever runs.

---

## The UserProfile Model

Django's built-in `User` model covers the basics: username, password, email. But this project needs a friends list — something the built-in model doesn't have.

The solution is a `UserProfile` that extends the built-in User through a `OneToOneField`:

```python
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    friends = models.ManyToManyField(User, related_name='friends', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Why `OneToOneField` instead of just adding fields to User?**
You cannot modify Django's built-in `User` model without replacing it entirely (which requires a migration from the beginning of the project). `OneToOneField` is the standard Django pattern for profile extensions — it creates a separate `userprofile` table with a guaranteed 1:1 link. Access is clean: `user.profile.friends.all()`.

**`on_delete=models.CASCADE`** — if the `User` is deleted, the `UserProfile` is automatically deleted too. No orphaned profile rows.

**`auto_now_add=True`** — Django sets `created_at` to the current timestamp automatically when the row is first created. You never set this manually. Similarly, `auto_now=True` on `updated_at` refreshes it on every `save()` call.

**Why not use `auto_now` for `created_at`?**
`auto_now` updates on every save. If you used it for `created_at`, the creation timestamp would be overwritten every time you saved the profile. `auto_now_add` only fires on `INSERT`, never on `UPDATE`.

---

## The Friends System

The friends system is **asymmetric add, bidirectional read**.

**Adding a friend is one-directional:**
When Alice adds Bob as a friend, only Alice's `profile.friends` contains Bob. Bob's profile is unchanged. This is intentional — you can "follow" someone without them needing to approve.

**Reading friends is bidirectional:**
`UserService.get_friends(user)` returns everyone from both directions:

```python
# People I explicitly added
added_by_me_ids = set(user.profile.friends.values_list('id', flat=True))

# People who added me (I show up in their friends list)
added_me = User.objects.filter(profile__friends=user)
```

Each friend entry has an `added_by_me` flag so the frontend can show different UI (e.g., "Following" vs "Friend").

**Why this matters for sharing:**
The `SharingService` requires friendship before sharing a table. It checks both directions — if Alice added Bob OR Bob added Alice, they are considered mutual friends for sharing purposes.

---

## Service Layer

### AuthService

All cookie management, token generation, and user registration live here. Views call these methods — they don't write cookie logic themselves.

| Method | What It Does |
|--------|-------------|
| `register(data)` | Validates via `userRegisterSerializer`, calls `create_user()`, returns `(user, None)` or `(None, errors)` |
| `login(username, password)` | Calls Django's `authenticate()`, raises `InvalidCredentials` on failure |
| `generate_tokens(user)` | Returns `(access_token, refresh_token)` pair |
| `set_auth_cookies(response, access, refresh)` | Writes both cookies with correct security flags |
| `set_access_cookie(response, access)` | Writes only the access cookie (used during rotation) |
| `clear_auth_cookies(response)` | Deletes both cookies (logout) |

### UserService

All user lookup, profile updates, password changes, and friend management.

| Method | What It Does |
|--------|-------------|
| `get_user(user_id)` | `User.objects.get(id=user_id)` — raises `UserNotFound` if missing |
| `update_details(user, current_pw, new_pw, confirm_pw)` | Verifies current password before changing |
| `update_profile(user, password, email, username)` | Verifies password, checks uniqueness, saves |
| `get_friends(user)` | Returns bidirectional friends list with `added_by_me` flag |
| `manage_friend(user, friend_id, action)` | Add or remove friend via `.filter().exists()` check (no N+1) |

---

## API Endpoints Reference

### POST `/api/auth/register/`

- **Auth required:** No
- **Body:** `{ "username": "alice", "email": "alice@example.com", "password": "pass123" }`
- **Response 200:** `{ "message": "User registered successfully.", "user": {...}, "access_token": "..." }`
- **Sets cookies:** `access_token` (1h), `refresh_token` (24h)
- **Errors:** 400 (validation failure, duplicate username/email)

### POST `/api/auth/login/`

- **Auth required:** No
- **Body:** `{ "username": "alice", "password": "pass123" }`
- **Response 200:** `{ "message": "Login successful.", "user": {...}, "access_token": "..." }`
- **Sets cookies:** `access_token` (1h), `refresh_token` (24h)
- **Errors:** 401 (invalid credentials)

### POST `/api/auth/logout/`

- **Auth required:** Yes
- **Response 200:** `{ "message": "Logged out successfully" }`
- **Clears cookies:** both `access_token` and `refresh_token`

### GET `/api/auth/me/`

- **Auth required:** Yes
- **Response 200:** `{ "id": 1, "username": "alice", "email": "alice@example.com", ... }`

### POST `/api/auth/update/` — Change your own password

- **Auth required:** Yes
- **Body:** `{ "password": "currentpass", "newpassword": "newpass123", "newpassword2": "newpass123" }`
- **Response 200:** `{ "message": "Password updated successfully" }`
- **Errors:** 400 (passwords don't match), 401 (wrong current password)

### GET `/api/auth/updateAcessToken/`

- **Auth required:** No (uses refresh cookie)
- **Cookie required:** `refresh_token`
- **Response 200:** `{ "message": "Access token update successful.", "access_token": "..." }`
- **Sets cookie:** new `access_token`

### GET `/api/auth/users-list/?search=alice`

- **Auth required:** Yes
- **Query params:** `search` (optional, filters by username)
- **Response 200:** DRF paginated response, 20 users per page. Excludes the requesting user.

### POST `/api/auth/friends/manage/`

- **Auth required:** Yes
- **Body:** `{ "friend_id": 5, "action": "add" }` or `{ "friend_id": 5, "action": "remove" }`
- **Response 200:** `{ "message": "Friend added successfully" }`
- **Errors:** 404 (friend not found), 400 (already friends / not friends / invalid action)

---

## Security Model

| Threat | Defense |
|--------|---------|
| **XSS token theft** | HttpOnly cookies — JS cannot read them |
| **CSRF** | `samesite='Lax'` on cookies + `CsrfViewMiddleware` in middleware |
| **Token forgery** | HMAC-SHA256 signature with `SECRET_KEY` — any tampered token is rejected |
| **Brute force login** | DRF throttling: 20 requests/hour for anonymous, 200/hour for authenticated |
| **Token interception** | `secure=True` in production — cookie only sent over HTTPS |
| **Expired token reuse** | `exp` claim in JWT payload — `jwt.decode()` raises `ExpiredSignatureError` automatically |
| **Account takeover via profile edit** | `UpdateUserDetails` uses `request.user` (authenticated user), not a user looked up from the request body |
| **Weak passwords** | Django's `AUTH_PASSWORD_VALIDATORS` — minimum length, similarity check, common password check |

### What Is Not Implemented (Future Work)

- **Token blacklist on logout** — a captured access token remains valid until expiry even after logout
- **Rate limiting on login by IP** — currently throttled by DRF's user-level throttler, not IP
- **Email verification on registration** — accounts are active immediately
- **Two-factor authentication**

---

## Common Errors

| Status | Message | Cause |
|--------|---------|-------|
| 401 | "Token has expired" | Access token is older than 1 hour. Call `GET /updateAcessToken/` |
| 401 | "Invalid token" | Token was tampered with, signed with a different key, or malformed |
| 401 | "Refresh token not provided." | The refresh cookie is missing. User must log in again |
| 401 | "Invalid credentials." | Wrong username or password at login |
| 400 | "Password updated successfully" | Not an error — but if you're debugging, confirm all three password fields were sent |
| 400 | Validation errors | Missing required fields or format failures from the serializer |
| 500 | "An error occurred while fetching user data." | Unexpected server error — check Django logs |
