/**
 * Remote Adapter Interface for Server Communication & Sync.
 * Enforces strict decoupling so backend implementations (Supabase, PocketBase, etc.)
 * can be swapped without modifying UI, database, or sync engine logic.
 */

export interface RemotePushResult {
  table: string;
  pushedCount: number;
  errors?: Array<{ id: string; error: string }>;
}

export interface RemotePullResult<T = Record<string, unknown>> {
  table: string;
  rows: T[];
  maxChangeSeq: number;
  hasMore: boolean;
}

export interface RemoteSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  shopId: string;
  role: 'owner' | 'attendant';
}

export interface RemoteAdapter {
  /**
   * Push a batch of outbox mutation items to the remote backend
   */
  pushBatch(
    table: string,
    rows: Array<Record<string, unknown>>
  ): Promise<RemotePushResult>;

  /**
   * Pull records that have changed since the specified sequence cursor
   */
  pullSince<T = Record<string, unknown>>(
    table: string,
    shopId: string,
    lastChangeSeq: number,
    limit?: number
  ): Promise<RemotePullResult<T>>;

  /**
   * Register a new shop & owner
   */
  register(payload: {
    shopName: string;
    ownerName: string;
    phone: string;
    pin: string;
    tillNumber?: string;
  }): Promise<{ session: RemoteSession; shopId: string }>;

  /**
   * Authenticate phone + PIN
   */
  login(payload: {
    phone: string;
    pin: string;
  }): Promise<{ session: RemoteSession; shopId: string }>;

  /**
   * Refresh session using refresh token
   */
  refreshToken(refreshToken: string): Promise<RemoteSession>;

  /**
   * Query server clock to calculate local skew
   */
  getServerTime(): Promise<{ serverTimeMs: number }>;
}
