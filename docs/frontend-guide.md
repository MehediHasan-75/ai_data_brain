# AI Data Brain — Frontend Implementation Guide

## 1. Project Setup

### Initialize the project

```bash
npx create-next-app@latest frontend --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"
cd frontend
```

### Install dependencies

```bash
# UI primitives
npm install @radix-ui/react-dialog @radix-ui/react-switch @radix-ui/react-checkbox
npm install @radix-ui/react-label @radix-ui/react-popover @radix-ui/react-slot

# Tailwind utilities
npm install clsx tailwind-merge class-variance-authority

# HTTP client
npm install axios

# Icons
npm install lucide-react react-icons

# Animation
npm install framer-motion

# Theme
npm install next-themes

# Voice input
npm install react-speech-recognition @types/react-speech-recognition

# Forms
npm install react-hook-form

# Syntax highlighting
npm install highlight.js
```

### Environment

Create `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/
NEXT_PUBLIC_ENABLE_VOICE=true
NEXT_PUBLIC_APP_NAME=DataBrain.AI
```

### Shadcn CLI config (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

---

## 2. File Structure

```
src/
  app/
    layout.tsx                   ← Root layout + provider tree
    globals.css                  ← Tailwind directives + CSS variables
    page.tsx                     ← Landing page (public)
    signin/
      page.tsx                   ← Login / register
    chat/
      page.tsx                   ← Main dashboard (protected)
    users/
      page.tsx                   ← Friends management (protected)

  components/
    Navbar.tsx                   ← Top navigation bar
    MainContent.tsx              ← Responsive layout container
    ProtectedRoute.tsx           ← Auth guard wrapper
    ToggleChat.tsx               ← Chat panel open/close toggle
    SettingsModal.tsx            ← User profile & password modal
    SideBarComps/
      SideBar.tsx                ← Table list sidebar
      SideBarEntries.tsx         ← Individual table row entry
      CreateTableButton.tsx      ← "New table" trigger
      CreateTableModal.tsx       ← Create-table form modal
    MainComponents/
      ShowTable.tsx              ← Full table with inline editing
      EmptyTableState.tsx        ← Empty state placeholder
    chat/
      ChatAreaReal.tsx           ← Live chat (API-backed)
      ChatArea.tsx               ← Demo chat (mock data)
    ui/                          ← Shadcn/Radix wrapper components
      button.tsx
      card.tsx
      checkbox.tsx
      dialog.tsx
      input.tsx
      label.tsx
      popover.tsx
      switch.tsx
      userSetting.tsx
    landingPageComponents/
      Navbar.tsx
      Hero.tsx
      Features.tsx
      Benefits.tsx
      CTA.tsx
      Footer.tsx

  context/
    AuthProvider.tsx             ← User session + token refresh
    ThemeProvider.tsx            ← Dark/light mode
    DataProviderReal.tsx         ← Table metadata + content state
    SelectedTableProvider.tsx    ← Currently selected table ID

  api/
    AuthApi.ts                   ← Auth endpoints
    ChatApiReal.ts               ← Agent chat + session management
    TableDataApi.ts              ← Table metadata (create/edit/delete/share)
    TableContentApi.ts           ← Rows + columns CRUD

  data/
    table.ts                     ← TableDataType interface + mock data
    TableContent.ts              ← TableRow / JsonTableItem types
    ChatMessages.ts              ← ChatMessage interface

  reducers/
    TableReducer.ts              ← Table metadata state reducer
    TableContentReducer.ts       ← Table rows/columns state reducer

  lib/
    utils.ts                     ← cn() utility (clsx + tailwind-merge)

  utils/
    csrf.ts                      ← CSRF token extraction from cookies
```

---

## 3. Core Types

Define these before writing any component or API file.

### `data/table.ts`

```ts
export interface TableDataType {
  id: number;
  table_name: string;
  description?: string;
  user_id: string;
  created_at: string;
  modified_at: string;
  is_shared: boolean;
  pendingCount: number;
  headers?: string[];
  owner?: User;
  shared_with?: User[];
}
```

### `data/TableContent.ts`

```ts
export interface TableRow {
  id: string | number;
  [key: string]: string | number | boolean | null;
}

export interface TableData {
  headers: string[];
  rows: TableRow[];
}

export interface JsonTableItem {
  id: number;      // same as DynamicTableData.id
  data: TableData;
}
```

### `data/ChatMessages.ts`

```ts
export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  displayedText?: string;
  isTyping?: boolean;
  agentData?: {
    response: string;
    tools_called: Array<{
      name: string;
      args: Record<string, unknown>;
    }>;
  };
}
```

---

## 4. `lib/utils.ts` — Class Utilities

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Use `cn()` everywhere instead of string concatenation for conditional Tailwind classes:

```tsx
<div className={cn("p-4 rounded", isActive && "bg-blue-100 dark:bg-blue-900")}>
```

---

## 5. `utils/csrf.ts` — CSRF Token

Django requires the `X-CSRFToken` header on all unsafe requests (POST, PUT, PATCH, DELETE). The token is stored in the `csrftoken` cookie.

```ts
export function getCSRFToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : null;
}
```

---

## 6. API Client Architecture

All four API modules follow the same pattern: a private `axios` instance with interceptors, and a public object exporting typed async methods.

### The Axios Instance (shared pattern)

Each API file creates its own `axios` instance:

```ts
import axios from "axios";
import { getCSRFToken } from "@/utils/csrf";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  withCredentials: true,          // sends HttpOnly JWT cookie automatically
  headers: { "Content-Type": "application/json" },
});
```

`withCredentials: true` is essential — it tells the browser to include the HttpOnly JWT cookies on every request. Without it, the cookie is never sent and every request returns 401.

### Response Interceptor — Token Refresh & 401 Handling

When a request returns 401 (token expired), don't immediately redirect. Instead:
1. Queue any concurrent requests that fail.
2. Try to refresh the token once.
3. If refresh succeeds: replay all queued requests.
4. If refresh fails: redirect to `/signin`.

```ts
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) =>
          failedQueue.push({ resolve, reject })
        ).then(() => apiClient(original));
      }
      isRefreshing = true;
      try {
        await apiClient.get("/auth/updateAcessToken/");
        processQueue(null);
        return apiClient(original);
      } catch (e) {
        processQueue(e as Error);
        window.location.href = "/signin";
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### Request Interceptor — CSRF Token

```ts
apiClient.interceptors.request.use((config) => {
  const safe = /^(GET|HEAD|OPTIONS|TRACE)$/i;
  if (!safe.test(config.method || "")) {
    const token = getCSRFToken();
    if (token) config.headers["X-CSRFToken"] = token;
  }
  return config;
});
```

### Standard Response Wrapper

All API methods return `ApiResponse<T>`:

```ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

Callers check `response.success` before using `response.data`. Errors are never thrown from API functions — they're returned as `{ success: false, error: "..." }`.

---

## 7. `api/AuthApi.ts` — Authentication

```ts
export const registerUser = (data: { username: string; email: string; password: string }) =>
  apiRequest<{ message: string }>("/auth/register/", "POST", data);

export const loginUser = (data: { username: string; password: string }) =>
  apiRequest<{ access_token: string }>("/auth/login/", "POST", data);

export const logoutUser = () =>
  apiRequest<{ message: string }>("/auth/logout/", "POST");

export const getSelfDetail = () =>
  apiRequest<User>("/auth/me/", "GET");

export const updateAccessToken = () =>
  apiRequest<{ message: string }>("/auth/updateAcessToken/", "GET");

export const updateUserProfile = (data: { name?: string; email?: string }) =>
  apiRequest<User>("/auth/update-profile/", "PATCH", data);

export const updateUserPassword = (data: { old_password: string; new_password: string }) =>
  apiRequest<{ message: string }>("/auth/update-profile/", "PATCH", data);

export const getUsersList = () =>
  apiRequest<User[]>("/auth/users-list/", "GET");

export const getFriendsList = () =>
  apiRequest<User[]>("/auth/friends/", "GET");

export const manageFriend = (data: { friend_id: number; action: "add" | "remove" }) =>
  apiRequest<{ message: string }>("/auth/friends/manage/", "POST", data);
```

---

## 8. `api/TableDataApi.ts` — Table Metadata

Handles the `DynamicTableData` model: names, descriptions, ownership, sharing.

```ts
export const tableApi = {
  getTables: () =>
    apiRequest<{ data: TableDataType[] }>("/api/main/tables/", "GET"),

  addTable: (data: { table_name: string; description: string; headers: string[] }) =>
    apiRequest("/api/main/create-table/", "POST", data),

  editTable: (id: number, data: { table_name?: string; description?: string }) =>
    apiRequest("/api/main/update-table/", "PUT", { id, ...data }),

  deleteTable: (id: number) =>
    apiRequest(`/api/main/delete-table/${id}/`, "DELETE"),

  shareTable: (payload: { table_id: number; friend_ids: number[]; action: "share" | "unshare" }) =>
    apiRequest("/api/main/share-table/", "POST", payload),
};
```

---

## 9. `api/TableContentApi.ts` — Rows & Columns

Handles `JsonTable` and `JsonTableRow`: the actual data inside tables.

```ts
export const jsonTableApi = {
  getTables: () =>
    apiRequest<JsonTableItem[]>("/api/main/get-table-content/", "GET"),

  addTable: (payload: { table_name: string; headers: string[]; description: string }) =>
    apiRequest("/api/main/create-table/", "POST", payload),

  addRow: (tableId: number, row: Omit<TableRow, "id">) =>
    apiRequest("/api/main/add-row/", "POST", { tableId, row }),

  editRow: (tableId: number, rowId: string | number, newRow: Partial<TableRow>) =>
    apiRequest("/api/main/update-row/", "PATCH", { tableId, rowId, newRowData: newRow }),

  deleteRow: (tableId: number, rowId: string | number) =>
    apiRequest("/api/main/delete-row/", "POST", { tableId, rowId }),

  addColumn: (tableId: number, header: string) =>
    apiRequest("/api/main/add-column/", "POST", { tableId, header }),

  deleteColumn: (tableId: number, header: string) =>
    apiRequest("/api/main/delete-column/", "POST", { tableId, header }),

  editHeader: (tableId: number, oldHeader: string, newHeader: string) =>
    apiRequest("/api/main/edit-header/", "POST", { tableId, oldHeader, newHeader }),
};
```

---

## 10. `api/ChatApiReal.ts` — Agent Chat

The chat flow is more complex than a single endpoint call. Each conversation requires a **session**, messages are persisted, and the AI response comes from the agent endpoint.

```
sendMessage(userMessage)
    │
    ├── GET /agent/chat/sessions/               ← find active session
    │   └── POST /agent/chat/sessions/          ← or create one
    │
    ├── POST /agent/chat/sessions/{id}/messages/save/   ← save user message
    │
    ├── POST /agent/streaming/                  ← get AI response
    │       { query, table_id?, context_type? }
    │
    └── POST /agent/chat/sessions/{id}/messages/save/   ← save bot response
```

### `chatApi.sendMessage(message, tableId?)`

- Gets or creates a chat session.
- Saves the user message to the session.
- POSTs the query to `/agent/streaming/` with an optional `table_id` for table-scoped context.
- Parses `formatted_response || response || message` from the agent reply.
- Extracts `tools_called` from `raw_response.messages` (filters for `type === "tool_use"`).
- Saves the bot message with `agent_data`.
- Returns `{ success: true, data: ChatMessage }`.

### `chatApi.loadChatHistory()`

- Fetches all sessions via `GET /agent/chat/sessions/`.
- Takes the first (most recent) session.
- Fetches its messages via `GET /agent/chat/sessions/{id}/messages/`.
- Returns formatted `ChatMessage[]`.

### `chatApi.clearChatHistory()`

- Gets the current session ID.
- Calls `DELETE /agent/chat/sessions/{id}/messages/`.

---

## 11. `context/AuthProvider.tsx` — User Session

**This is a `"use client"` module.**

Provides: `{ user, setUser, refreshUser, loading, signOut }`

### State

- `user: User | null` — the currently authenticated user
- `loading: boolean` — true while checking session on mount

### On mount (`useEffect`)

- Calls `getSelfDetail()` to verify the JWT cookie is still valid and fetch fresh user data.
- If successful: stores user in localStorage + state.
- If failed (token expired, no cookie): calls `handleTokenExpiration()` → clears localStorage, redirects to `/signin`.
- Sets `loading = false` in both cases.

### Token refresh (`setInterval`)

- Every **4 minutes**, calls `updateAccessToken()` (`GET /auth/updateAcessToken/`).
- If refresh fails: calls `handleTokenExpiration()`.
- The interval is cleared on unmount via `useEffect` cleanup.

Why 4 minutes? The access token likely expires in 5 minutes. Refreshing at 4 minutes gives a 1-minute buffer before the token expires, preventing any request from hitting a 401 mid-session.

### `signOut()`

- Calls `POST /auth/logout/` to clear the server-side cookie.
- Always calls `handleTokenExpiration()` afterwards — even if the API call fails — to clear local state and redirect.

### Hook

```ts
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
};
```

---

## 12. `context/ThemeProvider.tsx` — Dark/Light Mode

**This is a `"use client"` module.**

Wraps `next-themes`'s `ThemeProvider` with the project's own `useTheme` hook for consistency:

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

`attribute="class"` adds `class="dark"` to `<html>` when dark mode is active — this is how Tailwind's `dark:` variant works.

---

## 13. `context/DataProviderReal.tsx` — Table State

**Two contexts in one provider.**

The provider fetches both table metadata and table content on mount and exposes them via two separate contexts so components can subscribe to only what they need.

```tsx
export const DataProvider = ({ children }) => {
  const [tablesData, dispatchTablesData] = useReducer(TableReducer, []);
  const [tablesContent, dispatchtablesContent] = useReducer(jsonTableReducer, []);

  const refreshData = async () => {
    const content = await jsonTableApi.getTables();
    if (content.success) dispatchtablesContent({ type: "SET_TABLES", payload: content.data });

    const meta = await tableApi.getTables();
    if (meta.success) dispatchTablesData({ type: "SET_TABLES", payload: meta.data });
  };

  useEffect(() => { refreshData(); }, []);

  const getTableData = (id: number | null) =>
    id === null ? [] : tablesData.filter((t) => t.id === id);

  const getTableContents = (id: number | null) =>
    id === null ? [] : tablesContent.filter((t) => t.id === id);

  return (
    <TablesDataContext.Provider value={{ tablesData, dispatchTablesData, getTableData }}>
      <TablesContentContext.Provider value={{ tablesContent, dispatchtablesContent, getTableContents, refreshData }}>
        {children}
      </TablesContentContext.Provider>
    </TablesDataContext.Provider>
  );
};
```

**Why two contexts?** A component that only renders the sidebar (showing table names) shouldn't re-render every time a row is edited. Splitting metadata and content into separate contexts means only the components that subscribe to content re-render on row changes.

### Hooks

```ts
export const useTablesData = () => useContext(TablesDataContext);    // metadata
export const useTablesContent = () => useContext(TablesContentContext); // rows + columns
```

---

## 14. Reducers

Reducers handle all local state mutations before/after API calls. They keep the UI snappy — the state updates immediately without waiting for a network round-trip.

### `TableReducer.ts` — Metadata Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `SET_TABLES` | `TableDataType[]` | Replace entire list (on initial load) |
| `ADD_TABLE` | `{ id, table_name, description, headers }` | Append new table, sort by `modified_at` desc |
| `EDIT` | `{ id, table_name }` | Rename table, update `modified_at`, re-sort |
| `SHARE` | `{ id, is_shared, shared_with }` | Update sharing state |
| `DELETE` | `{ id }` | Remove table from list |

### `TableContentReducer.ts` — Rows & Columns Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `SET_TABLES` | `JsonTableItem[]` | Replace all content |
| `ADD_TABLE` | `JsonTableItem` | Append new table content |
| `ADD_ROW` | `{ tableId, row }` | Push row to table's rows array |
| `EDIT_ROW` | `{ tableId, rowId, newRow }` | Merge partial update into existing row |
| `DELETE_ROW` | `{ tableId, rowId }` | Filter out row by ID |
| `ADD_COLUMN` | `{ tableId, header }` | Add header + backfill rows with `""` |
| `EDIT_HEADER` | `{ tableId, oldHeader, newHeader }` | Rename header + rename key in every row |
| `DELETE_COLUMN` | `{ tableId, header }` | Remove header + delete key from every row |
| `DELETE_TABLE` | `{ tableId }` | Filter out table |

The `EDIT_HEADER` reducer is a good example of why client-side state is valuable: it renames the key in every row object in memory instantly. The user sees the column name change immediately while the API call happens in the background.

---

## 15. `app/layout.tsx` — Root Layout

```tsx
import { UserProvider } from "@/context/AuthProvider";
import { ThemeProvider } from "@/context/ThemeProvider";

export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI",
  description: "Manage your data with Voice & AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <UserProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </UserProvider>
      </body>
    </html>
  );
}
```

`DataProvider` and `SelectedTableProvider` are not here — they're added only inside the protected `/chat` page, because they make API calls that require authentication.

---

## 16. `app/signin/page.tsx` — Auth Page

**This is a `"use client"` page.**

### Behavior

- On mount: if `useUser().user` is non-null and `!loading`, redirect to `/chat`.
- While `loading` is true: render a centered spinner.
- Otherwise: render the login/register form.

### State

- `mode: "login" | "register"` — toggles between the two forms
- `username`, `email`, `password` — form fields
- `error: string` — displayed below the submit button
- `submitting: boolean` — disables the button during the API call

### On login submit

```ts
const result = await loginUser({ username, password });
if (!result.success) { setError(result.error); return; }
await refreshUser();   // fetches user data and sets user in context
router.push("/chat");
```

### On register submit

```ts
const result = await registerUser({ username, email, password });
if (!result.success) { setError(result.error); return; }
// Auto-login after registration
await loginUser({ username, password });
await refreshUser();
router.push("/chat");
```

### Layout

Full-screen centered card. Toggle between Login and Register modes via two text links or tabs at the top. Match `dark:bg-gray-800` for the card, `dark:border-gray-700` for inputs.

---

## 17. `components/ProtectedRoute.tsx` — Auth Guard

Wrap any page that requires authentication:

```tsx
"use client";
import { useUser } from "@/context/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/signin");
  }, [user, loading, router]);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return null;
  return <>{children}</>;
}
```

Use it in any protected page:

```tsx
export default function ChatPage() {
  return (
    <ProtectedRoute>
      <DataProvider>
        <SelectedTableProvider>
          <ChatPageContent />
        </SelectedTableProvider>
      </DataProvider>
    </ProtectedRoute>
  );
}
```

---

## 18. `app/chat/page.tsx` — Main Dashboard

The chat page is the core of the app. It wraps everything in the data providers (which need auth) and composes the layout.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Navbar (logo, navigation, settings icon, theme toggle)      │
├────────────────────┬─────────────────────────────────────────┤
│  SideBar           │  ShowTable (or EmptyTableState)         │
│  (table list)      │                                         │
│                    │                                         │
│                    ├─────────────────────────────────────────┤
│                    │  ChatAreaReal (slide-in panel)          │
└────────────────────┴─────────────────────────────────────────┘
```

- `Navbar` — fixed at top, `h-14`
- Below: `flex h-[calc(100vh-3.5rem)]`
- `SideBar` — `w-64`, `border-r`, `overflow-y-auto`
- Right panel: flex column — table content fills remaining space; chat panel slides in from the right or bottom

### State

- `selectedTableId` — from `SelectedTableProvider` (which table is active in the sidebar)
- `chatOpen: boolean` — whether the chat panel is visible
- All table data — from `useTablesData()` and `useTablesContent()`

---

## 19. `components/SideBarComps/SideBar.tsx`

### Props

Reads from `useTablesData()` and `SelectedTableProvider` — no prop drilling needed.

### Layout

Flex column, full height, `bg-gray-50 dark:bg-gray-900`.

### Top section

- App logo (logo swaps between light/dark variants)
- "New Table" button → opens `CreateTableModal`

### Table list (scrollable `flex-1`)

Each entry (`SideBarEntries`):
- Shows `table_name`
- Active entry highlighted with `bg-blue-50 dark:bg-gray-700` + blue left border
- Clicking sets `selectedTableId`
- On hover: edit (pencil) and delete (trash) icons appear on the right
- Share icon if the table is currently shared with others (`is_shared: true`)

### `CreateTableModal`

- Form fields: table name, description, headers (comma-separated or tag input)
- On submit: calls `jsonTableApi.addTable()` + `tableApi.addTable()`
- On success: dispatches `ADD_TABLE` to both reducers, sets new table as selected

---

## 20. `components/MainComponents/ShowTable.tsx`

The most complex component. Renders the selected table as an editable spreadsheet.

### Data

```ts
const { getTableContents, dispatchtablesContent } = useTablesContent();
const { selectedTableId } = useSelectedTable();
const tableContent = getTableContents(selectedTableId)[0]; // JsonTableItem
```

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Table header: name + description + share button            │
├─────────────────────────────────────────────────────────────┤
│  Column headers (editable on double-click) + "Add column"   │
├─────────────────────────────────────────────────────────────┤
│  Rows (cells editable on click) + "Add row" at bottom       │
└─────────────────────────────────────────────────────────────┘
```

### Inline cell editing

- Click a cell → input appears in place (controlled `<input>`)
- Press `Enter` or blur → save:
  1. Dispatch `EDIT_ROW` to reducer (immediate UI update)
  2. Call `jsonTableApi.editRow()` in the background

### Column header editing

- Double-click header → editable input
- On blur: dispatch `EDIT_HEADER`, call `jsonTableApi.editHeader()`

### Add row

- "+" button at bottom of table
- Creates a new row object with empty string for every header
- Dispatches `ADD_ROW`, calls `jsonTableApi.addRow()`

### Add column

- "+" button in the header row
- Prompts for column name (inline input or small popover)
- Dispatches `ADD_COLUMN` (backfills all rows with `""`), calls `jsonTableApi.addColumn()`

### Delete row / column

- Row: delete icon appears on row hover; dispatches `DELETE_ROW`, calls `jsonTableApi.deleteRow()`
- Column: right-click header or header hover menu; dispatches `DELETE_COLUMN`, calls `jsonTableApi.deleteColumn()`

### Share table

- Share button in the table header
- Opens a popover listing all friends (from `getUsersList()`)
- Checkboxes to select who to share with
- On confirm: calls `tableApi.shareTable({ table_id, friend_ids, action: "share" })`, dispatches `SHARE`

---

## 21. `components/chat/ChatAreaReal.tsx`

The chat panel. Communicates with the backend agent and renders the conversation.

### State

- `messages: ChatMessage[]` — conversation history
- `inputText: string` — current input field value
- `isLoading: boolean` — true while waiting for agent response
- `isListening: boolean` — true when voice recognition is active

### On mount

- Calls `chatApi.loadChatHistory()` and sets `messages` from the result.

### Send message flow

```ts
const send = async (text: string) => {
  const userMsg: ChatMessage = { id: Date.now().toString(), text, sender: "user", timestamp: new Date() };
  setMessages((prev) => [...prev, userMsg]);
  setIsLoading(true);

  const botMsg = await chatApi.sendMessage(userMsg, selectedTableId?.toString());

  setMessages((prev) => [...prev, botMsg]);
  setIsLoading(false);

  // Refresh table data — agent may have modified tables
  await refreshData();
};
```

After the agent responds, `refreshData()` re-fetches all table content. This is what keeps the spreadsheet in sync with AI-driven changes — when you say "add a row for lunch today", the agent adds the row via the API and `refreshData()` pulls the new state into the client.

### Voice input

```ts
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

const { transcript, listening, resetTranscript } = useSpeechRecognition();

// When listening stops, send the transcript
useEffect(() => {
  if (!listening && transcript) {
    send(transcript);
    resetTranscript();
  }
}, [listening]);
```

The microphone button calls `SpeechRecognition.startListening({ language: "en-US" })` or `SpeechRecognition.stopListening()`. Only shown if `NEXT_PUBLIC_ENABLE_VOICE=true`.

### Message rendering

Each message in `messages` is rendered as a bubble:
- `sender === "user"`: right-aligned, blue background
- `sender === "bot"`: left-aligned, gray background, renders with `highlight.js` for code blocks
- If `agentData.tools_called.length > 0`: show a small collapsible "Tools used" section listing which tools the agent called

### Bot message typing effect

Instead of showing the full response instantly, animate the text character by character:

```ts
const [displayedText, setDisplayedText] = useState("");

useEffect(() => {
  if (message.sender !== "bot") return;
  let i = 0;
  const interval = setInterval(() => {
    setDisplayedText(message.text.slice(0, i + 1));
    i++;
    if (i >= message.text.length) clearInterval(interval);
  }, 10);
  return () => clearInterval(interval);
}, [message.text]);
```

### Input bar

```
┌──────────────────────────────────────────────┐
│  [textarea — auto-resize, Shift+Enter = newline]  [mic] [send] │
└──────────────────────────────────────────────┘
```

- `Enter` submits. `Shift+Enter` adds a newline.
- `textarea` auto-resizes: `height: auto` then `height: scrollHeight px` on every keystroke.
- Send button disabled when `inputText.trim() === ""` or `isLoading`.

---

## 22. `components/Navbar.tsx`

### Contents

- Left: `databrain_logo.png` (dark theme) / `databrain_log.png` (light theme) — swap based on `useTheme()`
- Center/Right navigation links: Tables, Users, Agent
- Right: settings icon → `SettingsModal`, theme toggle button

### Theme-aware logo

```tsx
const { theme } = useTheme();
<Image
  src={theme === "dark" ? "/databrain_logo.png" : "/databrain_log.png"}
  alt="DataBrain.AI"
  width={120} height={32}
/>
```

---

## 23. `components/SettingsModal.tsx`

A `Dialog` (Radix) containing two sections:

### Profile tab

- Current username and email (read-only display)
- Editable name field
- Save button → calls `updateUserProfile()`, updates user in context

### Password tab

- Old password, new password, confirm new password fields
- Submit → calls `updateUserPassword()`
- Error/success message inline

---

## 24. `app/users/page.tsx` — Friends Management

### State

- `allUsers: User[]` — everyone except the current user
- `friends: User[]` — current user's friends
- `search: string` — filter input

### On mount

- Calls `getUsersList()` filtered by search term
- Calls `getFriendsList()`

### UI

A two-column or tabbed layout:
- Left: search box + user list — each entry has "Add friend" / "Remove friend" button
- Right: current friends list

### Add/remove friend

```ts
const toggle = async (userId: number, isFriend: boolean) => {
  await manageFriend({ friend_id: userId, action: isFriend ? "remove" : "add" });
  await refreshFriends();  // re-fetch friends list
};
```

---

## 25. Dark Mode

All components use Tailwind `dark:` variants. The key rule: always pair every light-mode class with its dark equivalent.

| Element | Light | Dark |
|---------|-------|------|
| Page background | `bg-white` | `dark:bg-gray-900` |
| Sidebar | `bg-gray-50` | `dark:bg-gray-900` |
| Cards / Modals | `bg-white` | `dark:bg-gray-800` |
| Input fields | `bg-white border-gray-300` | `dark:bg-gray-700 dark:border-gray-600` |
| Text primary | `text-gray-900` | `dark:text-gray-100` |
| Text secondary | `text-gray-500` | `dark:text-gray-400` |
| Borders | `border-gray-200` | `dark:border-gray-700` |
| Sidebar hover | `hover:bg-gray-100` | `dark:hover:bg-gray-700` |
| Active table entry | `bg-blue-50` | `dark:bg-gray-700` |

---

## 26. Responsive Layout

| Breakpoint | Behavior |
|------------|----------|
| `< md` (mobile) | Sidebar hidden by default, toggled via hamburger in Navbar. Chat panel is full-screen overlay. |
| `>= md` (tablet) | Sidebar visible at `w-64`. Chat panel slides in alongside the table. |
| `>= lg` (desktop) | Same as tablet with more padding. Table scrolls horizontally if wide. |

---

## 27. Loading & Empty States

**Page loading (auth check):** Full-screen centered spinner — `animate-spin` on a circular SVG border.

**Sidebar skeleton:** 3–4 `animate-pulse` gray rectangles while `tablesData` is empty on first load.

**Empty table selection:** `EmptyTableState` component — centered illustration, "Select a table from the sidebar or create a new one" with a primary "Create Table" button.

**Chat loading (waiting for agent):** Animated three dots in the bot bubble:

```css
/* globals.css */
@keyframes bounce-dot {
  0%, 80%, 100% { transform: translateY(0); }
  40%           { transform: translateY(-6px); }
}
.dot { animation: bounce-dot 1.2s infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
```

---

## 28. Error Handling

- **API errors:** Returned as `{ success: false, error: "..." }`. Display inline — below form fields, inside the chat bubble in red, or as a toast.
- **401 errors:** Handled centrally in the Axios response interceptor — token is refreshed automatically. Components never need to handle 401 manually.
- **Network errors:** Axios catches these as `axiosError.request` (no response received). Show "Could not reach server — check your connection."
- **Chat errors:** If `sendMessage` fails, push an error `ChatMessage` with `sender: "bot"` and a red-tinted background.

---

## 29. Implementation Order

Build in this sequence — each step produces something runnable:

1. **Types** — `data/table.ts`, `data/TableContent.ts`, `data/ChatMessages.ts`
2. **Utilities** — `lib/utils.ts` (cn), `utils/csrf.ts`
3. **API layer** — `AuthApi.ts`, then `TableDataApi.ts`, `TableContentApi.ts`, `ChatApiReal.ts`
4. **Contexts** — `AuthProvider.tsx` → `ThemeProvider.tsx` → `DataProviderReal.tsx` → `SelectedTableProvider.tsx`
5. **Reducers** — `TableReducer.ts`, `TableContentReducer.ts`
6. **`app/layout.tsx`** — root providers tree
7. **`app/signin/page.tsx`** + auth form — get login/register working end-to-end
8. **`components/ProtectedRoute.tsx`** — guard all inner pages
9. **`app/chat/page.tsx`** skeleton — layout with empty sidebar and placeholder content
10. **`SideBar.tsx`** + `CreateTableModal.tsx` — table list + create flow
11. **`ShowTable.tsx`** — full table rendering + inline editing
12. **`ChatAreaReal.tsx`** — chat panel, voice input, agent integration
13. **`SettingsModal.tsx`** — profile and password management
14. **`app/users/page.tsx`** — friends management
15. **Landing page** (`app/page.tsx`, `landingPageComponents/`) — Hero, Features, CTA
16. **Dark mode pass** — ensure every component has `dark:` variants
17. **Mobile responsive pass** — sidebar toggle, overlay chat, horizontal table scroll
18. **Polish** — typing animation, loading skeletons, empty states, error messages

---

## 30. Key Implementation Notes

- **`withCredentials: true` on every request.** The JWT lives in an HttpOnly cookie. Without this flag, the browser never sends the cookie and every authenticated request returns 401.

- **Optimistic updates via reducers.** Dispatch the reducer action before the API call completes. If the API call fails, you need to roll back — either dispatch a reverse action or call `refreshData()` to sync from the server. For most operations, silently syncing is simpler than tracking rollback state.

- **`refreshData()` after AI operations.** The agent can modify tables (add rows, rename columns, etc.). Always call `refreshData()` after `chatApi.sendMessage()` resolves so the table UI reflects the AI's changes.

- **Table ID is the join key.** `DynamicTableData.id`, `JsonTable.table_id`, and `JsonTableItem.id` are all the same integer. Use this to match metadata with content everywhere in the client.

- **Voice input requires HTTPS in production.** `react-speech-recognition` uses the Web Speech API, which browsers restrict to secure origins in production. Works on `localhost` without HTTPS.

- **Textarea auto-resize.** In the chat input's `onChange` handler:
  ```ts
  e.target.style.height = "auto";
  e.target.style.height = e.target.scrollHeight + "px";
  ```
  Cap it with `max-h-32 overflow-y-auto`.

- **No SSR for auth-dependent code.** Any code that reads `localStorage` must run in `useEffect` (never during render). `AuthProvider` reads `localStorage.getItem("user")` only inside `useEffect` / async functions.

- **`next-themes` requires `suppressHydrationWarning` on `<html>`.** The theme class is applied client-side after hydration, causing a brief mismatch. `suppressHydrationWarning` silences the React warning without hiding real bugs.
