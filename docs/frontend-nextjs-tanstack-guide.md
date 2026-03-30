# Frontend Deep-Dive: Next.js 15, TanStack Query, Zustand, Virtual Table & AI Streaming

> **Target audience:** Junior developers and anyone new to modern React. This guide walks through every major concept in the AI Data Brain frontend, explains *what* it does, *why* it was built that way, and *how* it works under the hood — using real analogies. No handwaving.

---

## Table of Contents

1. [Technology Stack at a Glance](#technology-stack-at-a-glance)
2. [Project Layout](#project-layout)
3. [React Fundamentals — What Problem It Solves](#react-fundamentals--what-problem-it-solves)
4. [TypeScript — Safety Belts for JavaScript](#typescript--safety-belts-for-javascript)
5. [Tailwind CSS — Styling Without Leaving HTML](#tailwind-css--styling-without-leaving-html)
6. [Next.js App Router — File-Based Everything](#nextjs-app-router--file-based-everything)
7. [The BFF Pattern — Why the Frontend Never Talks to Django Directly](#the-bff-pattern--why-the-frontend-never-talks-to-django-directly)
8. [Edge Middleware — The Bouncer at the Door](#edge-middleware--the-bouncer-at-the-door)
9. [TanStack Query — The Smart Data Fetcher](#tanstack-query--the-smart-data-fetcher)
10. [Zustand — Tiny Global State](#zustand--tiny-global-state)
11. [The Virtual Table — Rendering 10,000 Rows Without Crashing](#the-virtual-table--rendering-10000-rows-without-crashing)
12. [AI Chat Streaming — How Tokens Appear Letter by Letter](#ai-chat-streaming--how-tokens-appear-letter-by-letter)
13. [Optimistic Updates — Making the UI Feel Instant](#optimistic-updates--making-the-ui-feel-instant)
14. [Authentication Flow — HttpOnly Cookies and Why They Matter](#authentication-flow--httonly-cookies-and-why-they-matter)
15. [Feature Hooks — One Hook Per Thing](#feature-hooks--one-hook-per-thing)
16. [TypeScript Types Reference](#typescript-types-reference)
17. [Testing Setup](#testing-setup)
18. [Common Patterns Quick-Reference](#common-patterns-quick-reference)
19. [Glossary](#glossary)

---

## Technology Stack at a Glance

| Layer | Library | Version | Why It Was Chosen |
|-------|---------|---------|-------------------|
| Framework | **Next.js** (App Router) | 15 | Routing, server components, Route Handlers (BFF), edge middleware |
| UI library | **React** | 19 | Component model, hooks, Virtual DOM reconciliation |
| Language | **TypeScript** | 5 | Catch bugs at compile time, not in production |
| Styling | **Tailwind CSS** | 4 | Write styles directly in HTML — no context-switching to a CSS file |
| Server state | **TanStack Query** | 5 | Cache, deduplicate, and keep server data fresh automatically |
| UI state | **Zustand** | 5 | Minimal global store for things that aren't server data |
| Table | **TanStack Table + react-virtual** | 8 / 3 | Headless table logic + DOM virtualization for massive datasets |
| Chat streaming | **Vercel AI SDK** (`ai/react`) | 4 | `useChat` hook handles SSE, message state, and abort out of the box |
| Code highlighting | **highlight.js** | 11 | Syntax-colored code blocks in AI responses |
| Voice input | **react-speech-recognition** | 4 | Browser Web Speech API wrapper for hands-free chat |
| Testing | **Vitest + Playwright + MSW** | 4 / 1.58 / 2 | Unit tests, E2E tests, and mocked HTTP for tests |

---

## Project Layout

```
frontend/src/
│
├── app/                        ← Next.js App Router — pages live here
│   ├── api/                    ← BFF Route Handlers (server-side proxies)
│   │   ├── auth/               ← login, logout, register, me, refresh
│   │   ├── tables/             ← CRUD, rows, columns, share
│   │   ├── users/              ← users list, friends
│   │   ├── chat/               ← stream, sessions, messages
│   │   └── notifications/      ← SSE polling for table change events
│   ├── chat/page.tsx           ← Main dashboard (sidebar + table + chat)
│   ├── signin/page.tsx         ← Auth form (login + register)
│   ├── users/page.tsx          ← Friends management page
│   ├── page.tsx                ← Landing page
│   └── layout.tsx              ← Root HTML shell + providers
│
├── features/                   ← Self-contained feature modules
│   ├── chat/
│   │   ├── components/
│   │   │   ├── ChatContainer.tsx      ← useChat wrapper, message list
│   │   │   ├── MessageBubble.tsx      ← Renders one message with code highlighting
│   │   │   ├── ToolCallVisualizer.tsx ← Collapsible MCP tool call badges
│   │   │   └── PromptInputBox.tsx     ← Textarea + voice + send button
│   │   └── hooks/
│   │       └── useChatSession.ts      ← Session create/load/save
│   ├── tables/
│   │   ├── components/
│   │   │   ├── VirtualTableContainer.tsx  ← The virtualized table grid
│   │   │   ├── EditableCell.tsx           ← Click-to-edit inline cell
│   │   │   └── DataTableHeader.tsx        ← Rename + delete column header
│   │   └── hooks/
│   │       ├── useTableQuery.ts           ← useQuery wrappers for table data
│   │       └── useTableMutations.ts       ← useMutation with optimistic updates
│   ├── sidebar/
│   │   └── components/
│   │       ├── SideBar.tsx               ← Table list, uses useTablesQuery
│   │       ├── SideBarEntry.tsx          ← One table row — share/delete actions
│   │       └── CreateTableModal.tsx      ← New table form
│   └── users/
│       └── hooks/
│           └── useUsersQuery.ts          ← useQuery for users + friends
│
├── stores/
│   ├── uiStore.ts              ← Zustand: selectedTableId, sidebarOpen, chatOpen
│   └── authStore.ts            ← Zustand: user object, isLoading
│
├── lib/
│   ├── queryClient.ts          ← Single TanStack Query client instance
│   └── serverFetch.ts          ← Cookie-forwarding fetch for BFF route handlers
│
├── middleware.ts               ← Edge auth guard (runs before any page)
├── types/index.ts              ← All TypeScript interfaces in one place
└── context/
    ├── AuthProvider.tsx        ← useQuery(['user']) — keeps auth state fresh
    └── ThemeProvider.tsx       ← Dark/light toggle via CSS class
```

---

## React Fundamentals — What Problem It Solves

> **Analogy:** A traditional website is like a restaurant that reprints the entire menu every time a customer orders a dish. React is like a digital menu board that only updates the price tag that changed.

Without React, every time your data changes, you'd write JavaScript like this:
```js
document.getElementById('username').textContent = newName;
document.getElementById('email').textContent = newEmail;
// ...and so on for every element
```

React gives you a simpler model: describe **what the UI should look like** for a given state, and React figures out the smallest set of DOM changes needed.

```tsx
// You describe the result:
function UserCard({ name, email }) {
  return (
    <div>
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}
```

When `name` or `email` changes, React re-runs this function and compares the output to what's already in the DOM. Only the changed parts get updated. This is called **reconciliation**.

### Hooks — Functions That Remember Things

Hooks are special functions that let a component "remember" data across renders.

```tsx
const [count, setCount] = useState(0);
// count = current value
// setCount = function that updates it and triggers a re-render
```

`useEffect` runs code after the component renders — perfect for fetching data:

```tsx
useEffect(() => {
  fetch('/api/user').then(r => r.json()).then(setUser);
}, []); // [] = run once on mount
```

> In this project, you'll almost never write `useEffect` for data fetching. TanStack Query does that for you in a smarter way (see below).

---

## TypeScript — Safety Belts for JavaScript

> **Analogy:** JavaScript is like driving without a seatbelt — fine until something goes wrong. TypeScript is the seatbelt.

TypeScript adds type annotations that the compiler checks before your code runs. A bug that would crash at runtime becomes a red underline in your editor.

```ts
// Without TypeScript — no error until runtime
function getUsername(user) {
  return user.name.toUpperCase(); // crashes if user.name is null
}

// With TypeScript — error immediately in the editor
function getUsername(user: { name: string }): string {
  return user.name.toUpperCase(); // safe — TypeScript guarantees name is a string
}
```

All shared types live in `src/types/index.ts`:

```ts
// src/types/index.ts
export interface TableDataType {
  id: number;
  table_name: string;
  is_shared: boolean;
  owner: { id: number; username: string };
  shared_with: Array<{ id: number; username: string }>;
}

export interface JsonTableItem {
  id: number;
  data: {
    headers: string[];
    rows: TableRow[];
  };
}
```

Import them anywhere:
```ts
import type { TableDataType, JsonTableItem } from '@/types';
```

---

## Tailwind CSS — Styling Without Leaving HTML

> **Analogy:** Traditional CSS is like having a separate wardrobe in another room. Tailwind is wearing your clothes directly — the style is right there on the element.

Instead of writing:
```css
/* styles.css */
.card {
  padding: 16px;
  border-radius: 8px;
  background: white;
  border: 1px solid #e5e7eb;
}
```

You write:
```tsx
<div className="p-4 rounded-lg bg-white border border-gray-200">
```

The class names are utilities: `p-4` = `padding: 1rem`, `rounded-lg` = `border-radius: 0.5rem`. Dark mode is `dark:` prefix:

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

This project uses **Tailwind v4**, where dark mode is toggled by adding/removing a `dark` class on `<html>` — handled by `ThemeProvider.tsx`.

---

## Next.js App Router — File-Based Everything

> **Analogy:** Traditional routing is like writing a map by hand. Next.js App Router is like GPS — the file system *is* the map.

Every `page.tsx` file inside `src/app/` automatically becomes a URL route:

| File | URL |
|------|-----|
| `src/app/page.tsx` | `/` |
| `src/app/chat/page.tsx` | `/chat` |
| `src/app/signin/page.tsx` | `/signin` |
| `src/app/users/page.tsx` | `/users` |

**Route Handlers** (`route.ts` files inside `src/app/api/`) become API endpoints:

| File | Endpoint |
|------|----------|
| `src/app/api/auth/login/route.ts` | `POST /api/auth/login` |
| `src/app/api/tables/route.ts` | `GET/POST /api/tables` |
| `src/app/api/chat/stream/route.ts` | `POST /api/chat/stream` |

**Server vs. Client components:** By default, components are Server Components (run only on the server, no JavaScript sent to browser). Add `"use client"` at the top to make it interactive:

```tsx
"use client"; // ← this file runs in the browser

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

---

## The BFF Pattern — Why the Frontend Never Talks to Django Directly

> **Analogy:** A BFF (Backend For Frontend) is like a hotel concierge. Guests (the browser) ask the concierge for things. The concierge handles all the behind-the-scenes work (calling the kitchen, the laundry, the parking). The guest never needs to know each department's phone number.

**The old, fragile way:**
```
Browser → http://localhost:8000/auth/login/   ← hardcoded Django URL
```

Problems:
- In production, the Django URL changes. Every `baseURL` must be updated.
- The browser must send the CSRF token — which means reading cookies from JavaScript. HttpOnly cookies can't be read by JS.
- Three separate Axios clients each had their own token-refresh queue. They could race.

**The BFF way:**
```
Browser → /api/auth/login → Next.js Route Handler → http://localhost:8000/auth/login/
```

The Route Handler runs on the server, forwards the request to Django, and forwards the cookies back. The browser only ever talks to `/api/*` — the same origin, same protocol, no CORS issues.

Here's the actual pattern from `src/lib/serverFetch.ts`:

```ts
// serverFetch.ts — runs on the server inside Route Handlers

export async function serverFetch(path: string, init?: RequestInit) {
  const url = `${process.env.DJANGO_API_URL}${path}`;
  return fetch(url, init); // runs server-to-server, never in the browser
}

export async function forwardResponse(djangoRes: Response): Promise<NextResponse> {
  const data = await djangoRes.json();
  const response = NextResponse.json(data, { status: djangoRes.status });
  // Forward any Set-Cookie headers (JWT refresh tokens) back to the browser
  djangoRes.headers.getSetCookie().forEach(cookie => {
    response.headers.append('Set-Cookie', cookie);
  });
  return response;
}
```

A Route Handler is just a few lines:

```ts
// src/app/api/auth/me/route.ts
export async function GET(req: Request) {
  const res = await serverFetch('/auth/me/', {
    headers: { Cookie: req.headers.get('cookie') ?? '' },
  });
  return forwardResponse(res);
}
```

The browser calls `GET /api/auth/me`. Next.js runs this function on the server, calls Django with the real cookie, and returns the result. The browser never knows Django exists.

---

## Edge Middleware — The Bouncer at the Door

> **Analogy:** Middleware is a bouncer outside a club. You're checked *before* you step inside — not after you've already ordered a drink.

`src/middleware.ts` runs at the edge (before any page renders) and checks for a valid session cookie:

```ts
// src/middleware.ts
export const config = {
  matcher: ['/chat/:path*', '/users/:path*'], // only guard these routes
};

export async function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get('sessionid') ?? req.cookies.get('access_token');
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }
  return NextResponse.next();
}
```

If you try to visit `/chat` without being logged in, you're redirected to `/signin` instantly — before React even starts rendering. No JavaScript flash of the protected page.

---

## TanStack Query — The Smart Data Fetcher

> **Analogy:** Imagine you have a personal assistant who fetches your coffee every morning. If you ask again 5 minutes later, they say "you just had one, here it is again" from memory. They only go back to the café if it's been more than an hour. That's TanStack Query — a cache-aware, self-refreshing data fetcher.

**Before TanStack Query**, you'd write this pattern in every component:

```tsx
const [tables, setTables] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  setLoading(true);
  fetch('/api/tables')
    .then(r => r.json())
    .then(data => { setTables(data); setLoading(false); })
    .catch(err => { setError(err); setLoading(false); });
}, []);
```

That's 10 lines of boilerplate, repeated everywhere, with no caching or deduplication. If two components fetch the same URL, it fires two network requests.

**With TanStack Query:**

```tsx
// src/features/tables/hooks/useTableQuery.ts

export function useTablesQuery() {
  return useQuery({
    queryKey: ['tables'],           // ← the cache key
    queryFn: () => fetch('/api/tables').then(r => r.json()),
    staleTime: 60_000,              // consider data fresh for 1 minute
  });
}
```

```tsx
// Any component, anywhere
const { data: tables, isLoading, error } = useTablesQuery();
```

TanStack Query handles:
- **Caching** — if `useTablesQuery()` is called by 3 components, only 1 network request fires
- **Background refetching** — data auto-refreshes when the window regains focus
- **Loading/error states** — built-in without manual state management
- **Stale-while-revalidate** — shows cached data immediately, fetches fresh data silently

### Query Keys — The Cache Address

The `queryKey` is the address for cached data. Think of it like a filing cabinet label:

```ts
['tables']                        // all tables
['tables', 5]                     // table with id=5
['tables', 5, 'content']          // rows/data of table 5
['users']                         // all users
['users', 'friends']              // friends list
['chat', 'sessions', id, 'messages'] // chat history for session id
```

When you invalidate a key, all matching queries refetch:

```ts
// After Claude edits the table, refresh the table content:
queryClient.invalidateQueries({ queryKey: ['tables', 5, 'content'] });
```

---

## Zustand — Tiny Global State

> **Analogy:** If TanStack Query is the filing cabinet for server data, Zustand is the whiteboard on the wall — quick notes that don't need to be fetched from anywhere.

Some state doesn't come from the server — it's just UI state:
- Which table is currently selected?
- Is the sidebar open?
- Is the chat panel visible?

This is too "global" for `useState` (you'd have to pass it down as props through 5 components) but too trivial for TanStack Query (there's no server call).

Zustand is the answer:

```ts
// src/stores/uiStore.ts
import { create } from 'zustand';

interface UIState {
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTableId: null,
  setSelectedTableId: (id) => set({ selectedTableId: id }),
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));
```

Use it from any component — no props needed:

```tsx
// SideBar.tsx
const { selectedTableId, setSelectedTableId } = useUIStore();

// ChatContainer.tsx — in a completely different part of the tree
const selectedTableId = useUIStore(state => state.selectedTableId);
```

**Rule:** Zustand owns UI state only. Server data (tables, users, messages) belongs in TanStack Query, not Zustand. Mixing them causes cache-sync bugs.

---

## The Virtual Table — Rendering 10,000 Rows Without Crashing

> **Analogy:** A normal table is like printing every page of a 10,000-page book and laying them all out on the floor. A virtual table is like using a window — you only ever see 20 pages at a time, and as you scroll the window moves, showing the next 20.

When you render 10,000 `<tr>` elements in the DOM, the browser slows to a crawl. Even scrolling becomes janky. The solution: only render what's visible.

`VirtualTableContainer.tsx` uses two libraries together:

**TanStack Table** (`@tanstack/react-table`) — a headless table engine. It manages column definitions, sorting, and filtering, but renders **no HTML itself**. You get the logic; you write the JSX.

**@tanstack/react-virtual** — calculates which rows are visible based on the current scroll position, so you only render those rows.

```tsx
// Simplified from VirtualTableContainer.tsx

const ROW_HEIGHT = 40; // px

// TanStack Table manages column/row logic
const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
const rows = table.getRowModel().rows;

// react-virtual tracks the scroll container
const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => ROW_HEIGHT,
  overscan: 10, // render 10 extra rows above/below for smooth scroll
});

// virtualItems = only the rows currently visible
const virtualItems = virtualizer.getVirtualItems();

return (
  <div ref={parentRef} className="overflow-auto h-full">
    {/* Total height spacer — makes the scrollbar the right size */}
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualItems.map(virtualRow => {
        const row = rows[virtualRow.index];
        return (
          <div
            key={row.id}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: ROW_HEIGHT,
            }}
          >
            {row.getVisibleCells().map(cell => (
              <EditableCell key={cell.id} cell={cell} />
            ))}
          </div>
        );
      })}
    </div>
  </div>
);
```

With 10,000 rows and a window showing 20 rows, only ~30 DOM nodes exist at any time (20 visible + 10 overscan). Scrolling is smooth regardless of dataset size.

---

## AI Chat Streaming — How Tokens Appear Letter by Letter

> **Analogy:** Waiting for a full AI response is like waiting for someone to write an entire letter before handing it to you. Streaming is like reading over their shoulder as they write — each word appears as it's formed.

### The Full Pipeline

```
User types message
        ↓
ChatContainer.tsx calls useChat (Vercel AI SDK)
        ↓
POST /api/chat/stream  (Next.js BFF Route Handler)
        ↓
POST /agent/streaming/  (Django)
        ↓
LangGraph ReAct Agent calls Claude
        ↓
Claude picks MCP tools, executes them, writes response
        ↓
Django yields JSON response
        ↓
BFF translates to Vercel AI SDK stream format
        ↓
useChat appends tokens to messages[] live
        ↓
ChatContainer re-renders with new text
```

### The BFF Stream Adapter

Django returns a single JSON object (`AgentStreamingResponse`), not a true SSE stream. The BFF translates it into the format that `useChat` expects:

```ts
// src/app/api/chat/stream/route.ts (simplified)

export async function POST(req: Request) {
  const { message, tableId } = await req.json();

  const djangoRes = await fetch(`${process.env.DJANGO_API_URL}/agent/streaming/`, {
    method: 'POST',
    headers: { Cookie: req.headers.get('cookie') ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: message, table_id: tableId }),
  });

  const agentData = await djangoRes.json();
  const text = agentData.formatted_response ?? agentData.response ?? '';

  // Vercel AI SDK data-stream protocol:
  // 0:"text here"\n  ← text chunk
  // 8:[{...}]\n      ← annotations (tool calls)
  const stream = new ReadableStream({
    start(controller) {
      // Emit the text
      controller.enqueue(encoder.encode(`0:"${text.replace(/"/g, '\\"')}"\n`));
      // Emit tool call info as annotations
      if (agentData.tool_calls) {
        controller.enqueue(encoder.encode(`8:${JSON.stringify([{ toolCalls: agentData.tool_calls }])}\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    },
  });
}
```

### useChat — The Simple Side

In the component, `useChat` does all the heavy lifting:

```tsx
// src/features/chat/components/ChatContainer.tsx (simplified)

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat/stream',
  body: { tableId: selectedTableId },    // extra data sent with every message
  onFinish: () => {
    // After the response completes, refresh the table data
    queryClient.invalidateQueries({ queryKey: ['tables', selectedTableId, 'content'] });
  },
});
```

`messages` is an array that grows in real-time. Each message has `role: 'user' | 'assistant'` and `content: string`. `handleSubmit` sends the current `input` to the API. `isLoading` is `true` while a response is streaming.

### Tool Call Visualizer

Tool calls come back as `message.annotations`. `ToolCallVisualizer` reads them and shows collapsible badges:

```tsx
// If Claude called 'add_table_row' with args { table_id: 5, row_data: {...} }
// The user sees:  [add_table_row ▼]  — click to expand and see the args
```

---

## Optimistic Updates — Making the UI Feel Instant

> **Analogy:** When you click "Like" on a post, the heart turns red immediately — it doesn't wait for the server to confirm. That's an optimistic update. If the server says "no", the heart goes back to grey.

Editing a table cell with `useEditRow` uses an optimistic update pattern:

```ts
// src/features/tables/hooks/useTableMutations.ts (simplified)

export function useEditRow(tableId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rowId, data }) =>
      fetch(`/api/tables/${tableId}/rows/${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    onMutate: async ({ rowId, data }) => {
      // 1. Cancel any in-flight refetches (to avoid overwriting our optimistic state)
      await queryClient.cancelQueries({ queryKey: ['tables', tableId, 'content'] });

      // 2. Snapshot the current data (so we can roll back)
      const previous = queryClient.getQueryData(['tables', tableId, 'content']);

      // 3. Immediately update the cache with the new value
      queryClient.setQueryData(['tables', tableId, 'content'], (old: JsonTableItem) => ({
        ...old,
        data: {
          ...old.data,
          rows: old.data.rows.map(row =>
            row.id === rowId ? { ...row, ...data } : row
          ),
        },
      }));

      return { previous }; // return snapshot for rollback
    },

    onError: (_, __, context) => {
      // If something went wrong, restore the snapshot
      queryClient.setQueryData(['tables', tableId, 'content'], context?.previous);
    },

    onSettled: () => {
      // Always refetch after success or failure to sync with server
      queryClient.invalidateQueries({ queryKey: ['tables', tableId, 'content'] });
    },
  });
}
```

The sequence:
1. User edits a cell and presses Enter
2. `onMutate` fires: cache is updated instantly → the user sees the change
3. The network request goes out in the background
4. If it succeeds: `onSettled` re-fetches the real data from the server
5. If it fails: `onError` rolls back the cache to the snapshot

The user never sees a loading spinner for a cell edit. The UI feels instant.

---

## Authentication Flow — HttpOnly Cookies and Why They Matter

> **Analogy:** An `Authorization: Bearer` token in a normal header is like writing your ATM PIN on a sticky note on your screen. Anyone who can see your screen (any JavaScript on the page) can read it. An HttpOnly cookie is the PIN stored in a vault that only the bank (server) can access.

**HttpOnly cookies** cannot be read by JavaScript. `document.cookie` won't show them. This means even if an attacker injects malicious JavaScript into the page (XSS), they cannot steal the user's JWT.

### How Login Works

```
1. User submits form → POST /api/auth/login
2. BFF Route Handler forwards to Django POST /auth/login/
3. Django validates credentials, sets HttpOnly cookies:
     Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict
     Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict
4. BFF forwards the Set-Cookie headers back to the browser
5. Browser stores the cookies automatically (invisible to JS)
```

### How Every Request Works

```
1. Browser calls GET /api/tables
2. Browser automatically sends the cookies with the request
3. BFF Route Handler reads the Cookie header and forwards it to Django
4. Django's JWTAuthentication backend reads the cookie and authenticates
```

### Token Refresh

When the access token expires, Django returns `401`. The BFF's `serverFetch` handles this transparently — the refresh cookie is sent automatically, Django issues new tokens via `Set-Cookie`, and the BFF forwards them to the browser. The user never sees a login prompt.

### AuthProvider — Keeping User State Fresh

`src/context/AuthProvider.tsx` uses TanStack Query to keep the logged-in user's data current:

```tsx
const { data: user } = useQuery({
  queryKey: ['user'],
  queryFn: () => fetch('/api/auth/me').then(r => r.json()),
  staleTime: 4 * 60 * 1000,     // consider fresh for 4 minutes
  refetchInterval: 4 * 60 * 1000, // silently refresh every 4 minutes
  retry: false,
});
```

No `localStorage`. No `setInterval`. TanStack Query handles the timing.

---

## Feature Hooks — One Hook Per Thing

Every data-fetching or mutation operation is wrapped in a dedicated custom hook. This keeps components clean and makes logic reusable.

### Naming Convention

| Hook | What it does |
|------|-------------|
| `useTablesQuery()` | Fetch all tables (GET /api/tables) |
| `useTableContentQuery(id)` | Fetch rows+headers for one table |
| `useCreateTable()` | Create a table (mutation) |
| `useDeleteTable()` | Delete a table (mutation) |
| `useAddRow()` | Add a row (mutation) |
| `useEditRow(tableId)` | Edit a row with optimistic update |
| `useDeleteRow(tableId)` | Delete a row with optimistic update |
| `useAddColumn(tableId)` | Add a column (mutation) |
| `useDeleteColumn(tableId)` | Delete a column (mutation) |
| `useEditHeader(tableId)` | Rename a column (mutation) |
| `useShareTable()` | Share a table with a user |
| `useUsersQuery()` | Fetch all users |
| `useFriendsQuery()` | Fetch friends list |
| `useManageFriend()` | Add/remove friend (mutation) |

### Usage in a Component

```tsx
function MyComponent() {
  // Just call the hook — no fetch, no useEffect, no loading state boilerplate
  const { data: tables, isLoading } = useTablesQuery();
  const createTable = useCreateTable();

  if (isLoading) return <Spinner />;

  return (
    <button onClick={() => createTable.mutate({ name: 'My Table', headers: ['A', 'B'] })}>
      Create Table
    </button>
  );
}
```

---

## TypeScript Types Reference

All types are in `src/types/index.ts`. Here are the key ones:

```ts
// A table in the sidebar — metadata only (no rows)
interface TableDataType {
  id: number;
  table_name: string;
  created_at: string;         // ISO 8601
  modified_at: string;        // ISO 8601
  description?: string;
  is_shared: boolean;
  owner: { id: number; username: string };
  shared_with: Array<{ id: number; username: string }>;
}

// A single data row — keys are column names
interface TableRow {
  id: number | string;
  [key: string]: string | number | boolean | null | undefined;
}

// A table's full contents — headers + rows
interface JsonTableItem {
  id: number;
  data: {
    headers: string[];
    rows: TableRow[];
  };
}

// The logged-in user
interface User {
  id: number;
  username: string;
  email: string;
  name?: string;
}
```

---

## Testing Setup

### Unit Tests — Vitest

Vitest is a fast test runner that understands TypeScript and React natively. Configuration is in `vitest.config.ts`:

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',         // simulate a browser environment
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`src/test/setup.ts` imports `@testing-library/jest-dom` so you can write assertions like:
```ts
expect(element).toBeInTheDocument();
expect(button).toBeDisabled();
```

**Run unit tests:**
```bash
npm test
# or with UI:
npx vitest --ui
```

### Store Tests Example

```ts
// tests/unit/stores/uiStore.test.ts

describe('uiStore', () => {
  it('sets selectedTableId', () => {
    const { setSelectedTableId } = useUIStore.getState();
    setSelectedTableId(42);
    expect(useUIStore.getState().selectedTableId).toBe(42);
  });
});
```

### End-to-End Tests — Playwright

Playwright controls a real browser and tests the full stack:

```ts
// tests/e2e/auth.spec.ts

test('login and reach /chat', async ({ page }) => {
  await page.goto('/signin');
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'password123');
  await page.click('[type="submit"]');
  await expect(page).toHaveURL('/chat');
});
```

**Run E2E tests:**
```bash
npx playwright test
```

---

## Common Patterns Quick-Reference

### Fetch data in a component
```tsx
const { data, isLoading, error } = useTablesQuery();
```

### Mutate data
```tsx
const createTable = useCreateTable();
createTable.mutate({ table_name: 'Budget', headers: ['Date', 'Amount'] });
```

### Read UI state
```tsx
const selectedTableId = useUIStore(state => state.selectedTableId);
```

### Update UI state
```tsx
const setSelectedTableId = useUIStore(state => state.setSelectedTableId);
setSelectedTableId(5);
```

### Invalidate (refresh) a query after a mutation
```tsx
queryClient.invalidateQueries({ queryKey: ['tables', tableId, 'content'] });
```

### Call the BFF from a component
```tsx
// Just use fetch() — the BFF proxies to Django automatically
const res = await fetch('/api/tables', { method: 'POST', body: JSON.stringify(data) });
```

### Guard a route from unauthenticated access
No code needed — `middleware.ts` handles it automatically for `/chat` and `/users`.

---

## Glossary

| Term | Plain-English Meaning |
|------|----------------------|
| **BFF** | Backend For Frontend — a server layer between your browser and the real backend, so the browser only talks to a friendly, same-origin API |
| **SSE** | Server-Sent Events — a one-way stream from server to browser; used for streaming AI tokens |
| **Optimistic update** | Update the UI immediately, then confirm with the server; roll back if the server disagrees |
| **Virtual DOM** | React's in-memory representation of the UI; React diffs it against the real DOM and applies only the minimal changes |
| **Virtualization** | Only rendering the rows/items that are visible in the viewport — everything else stays out of the DOM |
| **Query key** | A cache address in TanStack Query — same key = same cached data |
| **Stale-while-revalidate** | Show cached data instantly, fetch fresh data in the background, then update silently |
| **HttpOnly cookie** | A cookie that browser JavaScript cannot read — only the server can see it |
| **MCP** | Model Context Protocol — a standard for giving an LLM typed tools it can call |
| **ReAct agent** | Reason → Act → Observe — an LLM loop that picks tools, calls them, reads results, and repeats |
| **Route Handler** | A `route.ts` file in Next.js that creates an API endpoint — the BFF is built from these |
| **Edge middleware** | Code that runs before any page renders — used here as an auth guard |
| **Zustand** | A tiny global state library — like Redux but without the boilerplate |
| **headless** | A library that provides logic and data but no HTML — you write the UI yourself |
