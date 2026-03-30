export interface TableDataType {
  id: number;
  table_name: string;
  user_id: string;
  created_at: string; // ISO 8601 datetime format
  modified_at: string; // ISO 8601 datetime format
  description?: string; // Optional field
  pendingCount: number;
  headers?: string[];
  is_shared: boolean;
  owner: {
    id: number;
    username: string;
  };
  shared_with: Array<{
    id: number;
    username: string;
  }>;
}

const tableData = [
  {
    id: 1,
    table_name: "posts",
    user_id: "1",
    created_at: "2025-05-01T10:00:00Z",
    modified_at: "2025-05-02T12:00:00Z",
    description: "Stores user-generated posts",
    pendingCount: 0,
  },
  {
    id: 2,
    table_name: "comments",
    user_id: "2",
    created_at: "2025-05-01T10:10:00Z",
    modified_at: "2025-05-02T12:15:00Z",
    description: "Stores comments made on posts",
    pendingCount: 0,
  },
  {
    id: 3,
    table_name: "likes",
    user_id: "3",
    created_at: "2025-05-01T10:20:00Z",
    modified_at: "2025-05-02T12:30:00Z",
    pendingCount: 0,
  },
  {
    id: 4,
    table_name: "messages",
    user_id: "4",
    created_at: "2025-05-01T10:30:00Z",
    modified_at: "2025-05-02T12:45:00Z",
    description: "Direct messages between users",
    pendingCount: 0,
  },
  {
    id: 5,
    table_name: "profiles",
    user_id: "1",
    created_at: "2025-05-01T10:40:00Z",
    modified_at: "2025-05-02T13:00:00Z",
    pendingCount: 0,
  },
  {
    id: 6,
    table_name: "notifications",
    user_id: "2",
    created_at: "2025-05-01T10:50:00Z",
    modified_at: "2025-05-02T13:15:00Z",
    pendingCount: 0,
  },
  {
    id: 7,
    table_name: "followers",
    user_id: "3",
    created_at: "2025-05-01T11:00:00Z",
    modified_at: "2025-05-02T13:30:00Z",
    pendingCount: 0,
  },
  {
    id: 8,
    table_name: "following",
    user_id: "4",
    created_at: "2025-05-01T11:10:00Z",
    modified_at: "2025-05-02T13:45:00Z",
    pendingCount: 0,
  },
  {
    id: 9,
    table_name: "settings",
    user_id: "1",
    created_at: "2025-05-01T11:20:00Z",
    modified_at: "2025-05-02T14:00:00Z",
    description: "User preferences and configurations",
    pendingCount: 0,
  },
  {
    id: 10,
    table_name: "media_files",
    user_id: "2",
    created_at: "2025-05-01T11:30:00Z",
    modified_at: "2025-05-02T14:15:00Z",
    pendingCount: 0,
  },
  {
    id: 11,
    table_name: "albums",
    user_id: "3",
    created_at: "2025-05-01T11:40:00Z",
    modified_at: "2025-05-02T14:30:00Z",
    pendingCount: 0,
  },
  {
    id: 12,
    table_name: "tags",
    user_id: "4",
    created_at: "2025-05-01T11:50:00Z",
    modified_at: "2025-05-02T14:45:00Z",
    pendingCount: 0,
  },
  {
    id: 13,
    table_name: "mentions",
    user_id: "1",
    created_at: "2025-05-01T12:00:00Z",
    modified_at: "2025-05-02T15:00:00Z",
    pendingCount: 0,
  },
  {
    id: 14,
    table_name: "stories",
    user_id: "2",
    created_at: "2025-05-01T12:10:00Z",
    modified_at: "2025-05-02T15:15:00Z",
    pendingCount: 0,
  },
  {
    id: 15,
    table_name: "reactions",
    user_id: "3",
    created_at: "2025-05-01T12:20:00Z",
    modified_at: "2025-05-02T15:30:00Z",
    pendingCount: 0,
  },
  {
    id: 16,
    table_name: "views",
    user_id: "4",
    created_at: "2025-05-01T12:30:00Z",
    modified_at: "2025-05-02T15:45:00Z",
    pendingCount: 0,
  },
  {
    id: 17,
    table_name: "shares",
    user_id: "1",
    created_at: "2025-05-01T12:40:00Z",
    modified_at: "2025-05-02T16:00:00Z",
    pendingCount: 0,
  },
  {
    id: 18,
    table_name: "bookmarks",
    user_id: "2",
    created_at: "2025-05-01T12:50:00Z",
    modified_at: "2025-05-02T16:15:00Z",
    description: "Stores content bookmarked by users",
    pendingCount: 0,
  },
  {
    id: 19,
    table_name: "subscriptions",
    user_id: "3",
    created_at: "2025-05-01T13:00:00Z",
    modified_at: "2025-05-02T16:30:00Z",
    pendingCount: 0,
  },
  {
    id: 20,
    table_name: "payments",
    user_id: "4",
    created_at: "2025-05-01T13:10:00Z",
    modified_at: "2025-05-02T16:45:00Z",
    description: "User payment history and records",
    pendingCount: 0,
  },
  {
    id: 21,
    table_name: "invoices",
    user_id: "1",
    created_at: "2025-05-01T13:20:00Z",
    modified_at: "2025-05-02T17:00:00Z",
    pendingCount: 0,
  },
  {
    id: 22,
    table_name: "transactions",
    user_id: "2",
    created_at: "2025-05-01T13:30:00Z",
    modified_at: "2025-05-02T17:15:00Z",
    pendingCount: 0,
  },
  {
    id: 23,
    table_name: "wallets",
    user_id: "3",
    created_at: "2025-05-01T13:40:00Z",
    modified_at: "2025-05-02T17:30:00Z",
    pendingCount: 0,
  },
  {
    id: 24,
    table_name: "notifications_archive",
    user_id: "4",
    created_at: "2025-05-01T13:50:00Z",
    modified_at: "2025-05-02T17:45:00Z",
    pendingCount: 0,
  },
  {
    id: 25,
    table_name: "activity_logs",
    user_id: "1",
    created_at: "2025-05-01T14:00:00Z",
    modified_at: "2025-05-02T18:00:00Z",
    description: "Logs of user actions and system activities",
    pendingCount: 0,
  },
  {
    id: 26,
    table_name: "devices",
    user_id: "2",
    created_at: "2025-05-01T14:10:00Z",
    modified_at: "2025-05-02T18:15:00Z",
    pendingCount: 0,
  },
  {
    id: 27,
    table_name: "locations",
    user_id: "3",
    created_at: "2025-05-01T14:20:00Z",
    modified_at: "2025-05-02T18:30:00Z",
    pendingCount: 0,
  },
  {
    id: 28,
    table_name: "reports",
    user_id: "4",
    created_at: "2025-05-01T14:30:00Z",
    modified_at: "2025-05-02T18:45:00Z",
    description: "User-submitted issue or content reports",
    pendingCount: 0,
  },
  {
    id: 29,
    table_name: "support_tickets",
    user_id: "1",
    created_at: "2025-05-01T14:40:00Z",
    modified_at: "2025-05-02T19:00:00Z",
    pendingCount: 5,
  },
  {
    id: 30,
    table_name: "audit_trails",
    user_id: "2",
    created_at: "2025-05-01T14:50:00Z",
    modified_at: "2025-05-02T19:15:00Z",
    pendingCount: 0,
  },
  {
    id: 31,
    table_name: "activity_logs",
    user_id: "1",
    created_at: "2025-05-01T14:00:00Z",
    modified_at: "2025-05-02T18:00:00Z",
    description: "Logs of user actions and system activities",
    pendingCount: 0,
  },
  {
    id: 32,
    table_name: "activity_logs",
    user_id: "1",
    created_at: "2025-05-01T14:00:00Z",
    modified_at: "2025-05-02T18:00:00Z",
    description: "Logs of user actions and system activities",
    pendingCount: 0,
  },
  {
    id: 33,
    table_name: "activity_logs",
    user_id: "1",
    created_at: "2025-05-01T14:00:00Z",
    modified_at: "2025-05-02T18:00:00Z",
    description: "Logs of user actions and system activities",
    pendingCount: 0,
  },
];

const getTableData = (user_id: TableDataType["user_id"]) => {
  const filteredTableData = tableData
    .filter((table) => table.user_id === user_id)
    .sort((a, b) => b.modified_at.localeCompare(a.modified_at));

  return filteredTableData;
};

export { getTableData };
