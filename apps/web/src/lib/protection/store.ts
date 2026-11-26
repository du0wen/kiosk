export type FixedWindowInput = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs: number;
};

export type FixedWindowResult = {
  allowed: boolean;
  count: number;
  resetAtMs: number;
};

export type SlidingWindowInput = FixedWindowInput & {
  eventId: string;
};

export type LeaseInput = {
  key: string;
  leaseId: string;
  limit: number;
  ttlMs: number;
  nowMs: number;
};

export interface RateLimitStore {
  consumeFixedWindow(input: FixedWindowInput): Promise<FixedWindowResult>;
  consumeSlidingWindow(input: SlidingWindowInput): Promise<FixedWindowResult>;
}

export interface SemaphoreStore {
  acquireLease(input: LeaseInput): Promise<boolean>;
  releaseLease(key: string, leaseId: string): Promise<void>;
}

export type ProtectionStore = RateLimitStore & SemaphoreStore;
