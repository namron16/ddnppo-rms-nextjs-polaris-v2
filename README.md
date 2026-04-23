# DDNPPO Records Management System — Next.js

A complete **Next.js 14 · TypeScript · Tailwind CSS** implementation of the
DDNPPO RMS UI prototype, with routing, auth, live search, modals, toasts, and
confirmation dialogs fully wired.

---

## 📁 Project Structure

```
ddnppo-rms-nextjs/
│
├── middleware.ts                        ← Edge route protection (auth cookies)
│
├── app/                                 ← Next.js App Router
│   ├── layout.tsx                       ← Root layout: AuthProvider + ToastProvider
│   ├── page.tsx                         ← Root redirect (→ /login or /admin/master)
│   ├── globals.css                      ← Global styles + CSS design tokens
│   │
│   ├── login/
│   │   └── page.tsx                     ← Login form (validates + sets cookie)
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                   ← AuthGuard (officer role only)
│   │   └── page.tsx                     ← Officer dashboard + 6 quick-access modals
│   │
│   └── admin/
│       ├── layout.tsx                   ← AuthGuard (admin role) + Sidebar shell
│       ├── master/page.tsx              ← Master Docs: stats, live search, tree, detail
│       ├── special-orders/page.tsx      ← Special Orders: search, filter, add modal
│       ├── daily-journals/page.tsx      ← Journals: tabs, search, add modal
│       ├── confidential/page.tsx        ← Confidential Docs: unlock, search, add modal
│       ├── directory/page.tsx           ← Org Chart: recursive tree
│       ├── library/page.tsx             ← Library: category filter, search, add modal
│       ├── log-history/page.tsx         ← Activity Logs: action filter, CSV export toast
│       ├── user-management/page.tsx     ← Users: search, add modal, delete confirm
│       ├── archive/page.tsx             ← Archive: restore + delete confirm dialogs
│
├── components/
│   ├── layout/
│   │   ├── AuthGuard.tsx               ← Client-side route guard with loading spinner
│   │   └── Sidebar.tsx                 ← Fixed admin nav with active link highlighting
│   │
│   ├── modals/                          ← "Add / New" form modals (one per entity)
│   │   ├── AddDocumentModal.tsx         ← Upload master document
│   │   ├── AddSpecialOrderModal.tsx     ← Create special order
│   │   ├── AddJournalEntryModal.tsx     ← Add journal entry
│   │   ├── AddConfidentialDocModal.tsx  ← Add confidential document
│   │   ├── AddLibraryItemModal.tsx      ← Add library item
│   │   └── AddUserModal.tsx            ← Add system user
│   │
│   └── ui/                             ← Reusable primitives
│       ├── index.ts                    ← Barrel export
│       ├── AlertWarning.tsx            ← Yellow warning banner
│       ├── Avatar.tsx                  ← Coloured initials circle
│       ├── Badge.tsx                   ← Status / level / type pill
│       ├── Button.tsx                  ← 6-variant button
│       ├── ConfirmDialog.tsx           ← Destructive action dialog
│       ├── EmptyState.tsx              ← Empty list placeholder
│       ├── LoadingSpinner.tsx          ← Auth rehydration spinner
│       ├── Modal.tsx                   ← Overlay + dialog wrapper
│       ├── OrgChart.tsx               ← Recursive org chart
│       ├── PageHeader.tsx              ← Sticky title + date bar
│       ├── SearchInput.tsx             ← Controlled search with clear button
│       ├── StatCard.tsx                ← Summary stat card
│       ├── Toast.tsx                   ← Toast system (success/error/info/warning)
│       └── Toolbar.tsx                 ← Toolbar row + ToolbarSelect
│
├── hooks/
│   └── index.ts                        ← useSearch · useModal · useDisclosure · useActiveTab
│
├── lib/
│   ├── auth.tsx                        ← AuthContext + cookie persistence + useAuth()
│   ├── data.ts                         ← All mock/seed data (replace with API)
│   └── utils.ts                        ← cn() · badge class helpers · formatDate()
│
├── types/
│   └── index.ts                        ← All TypeScript interfaces
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── next.config.js
```

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open in browser
open http://localhost:3000
```

---

## 🔑 Demo Credentials

| Role          | Email                       | Password |
|---------------|-----------------------------|----------|
| Administrator | rdelacruz@ddnppo.gov.ph     | password |
| Officer       | asantos@ddnppo.gov.ph       | password |

---

## 🗺️ Route Map

| Route                       | Role    | Description                       |
|-----------------------------|---------|-----------------------------------|
| `/login`                    | Public  | Login screen                      |
| `/dashboard`                | Officer | Quick-access cards + 6 modals     |
| `/admin/master`             | Admin   | Master Docs (default admin route) |
| `/admin/special-orders`     | Admin   | Special Orders table              |
| `/admin/daily-journals`     | Admin   | Journals with tab filter          |
| `/admin/confidential`       | Admin   | Confidential Docs                 |
| `/admin/directory`          | Admin   | Personnel Org Chart               |
| `/admin/library`            | Admin   | Document Library                  |
| `/admin/log-history`        | Admin   | Activity Log History              |
| `/admin/user-management`    | Admin   | User Management                   |
| `/admin/archive`            | Admin   | Archived Documents                |

---

## 🧩 Hook Reference

| Hook                | Purpose                                        |
|---------------------|------------------------------------------------|
| `useSearch(items, keys)` | Live search filter over an array          |
| `useModal()`        | `{ isOpen, open, close }` for simple modals    |
| `useDisclosure<T>()`| Modal + typed payload (`open(item)`)           |
| `useActiveTab<T>()` | Tab state manager                              |
| `useAuth()`         | `{ user, login, logout, isLoading }`           |
| `useToast()`        | `{ toast: { success, error, info, warning } }` |

---

## 📦 Tech Stack

| Tool            | Purpose                              |
|-----------------|--------------------------------------|
| Next.js 14      | App Router, file-based routing       |
| TypeScript      | Full type safety                     |
| Tailwind CSS    | Utility-first styling                |
| Lucide React    | Icons (Modal close button)           |
| clsx            | Conditional class merging            |

---

## 🔌 Connecting a Real Backend

Replace the mock data in `lib/data.ts` with API calls:

```ts
// Example: fetch special orders from your API
export async function getSpecialOrders(): Promise<SpecialOrder[]> {
  const res = await fetch('/api/special-orders')
  return res.json()
}
```

Replace cookie auth in `lib/auth.tsx` with a real JWT or NextAuth.js session.
