import { createRequire } from "node:module";

// =============================================================================
// Persistent storage for Product Submission Review Bot.
// Uses Redis when REDIS_URL is set (production), in-memory Map otherwise
// (dev / test harness). Durable domain data — never the session store.
// =============================================================================

export interface Seller {
  telegramId: number;
  name: string;
  businessType?: string;
  storefronts: string[];
  registeredAt: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number | null;
  photos: string[];
  status: "pending_review" | "assigned" | "published" | "rejected";
  submitterId: number;
  assignedStorefront?: string;
  auditHistory: ReviewAction[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAction {
  actionType: string;
  timestamp: string;
  performer: number;
  reason?: string;
}

export interface ProductStorage {
  getSeller(id: number): Promise<Seller | undefined>;
  saveSeller(seller: Seller): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  getProduct(id: string): Promise<Product | undefined>;
  updateProduct(product: Product): Promise<void>;
  getSellerProductIds(sellerId: number): Promise<string[]>;
  getInboxProductIds(): Promise<string[]>;
}

// --- In-memory fallback (dev / test harness) ---

class MemStore implements ProductStorage {
  private sellers = new Map<number, Seller>();
  private products = new Map<string, Product>();
  private sellerProductIds = new Map<number, string[]>();
  private inboxIds: string[] = [];

  async getSeller(id: number): Promise<Seller | undefined> {
    return this.sellers.get(id);
  }

  async saveSeller(seller: Seller): Promise<void> {
    this.sellers.set(seller.telegramId, seller);
  }

  async saveProduct(product: Product): Promise<void> {
    this.products.set(product.id, product);
    const ids = this.sellerProductIds.get(product.submitterId) ?? [];
    ids.push(product.id);
    this.sellerProductIds.set(product.submitterId, ids);
    if (product.status === "pending_review") {
      this.inboxIds.push(product.id);
    }
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async updateProduct(product: Product): Promise<void> {
    this.products.set(product.id, product);
  }

  async getSellerProductIds(sellerId: number): Promise<string[]> {
    return this.sellerProductIds.get(sellerId) ?? [];
  }

  async getInboxProductIds(): Promise<string[]> {
    return this.inboxIds.filter((id) => {
      const p = this.products.get(id);
      return p && p.status === "pending_review";
    });
  }
}

// --- Redis-backed store (production) ---

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

class RedisStore implements ProductStorage {
  constructor(private readonly client: RedisLike) {}

  async getSeller(id: number): Promise<Seller | undefined> {
    const raw = await this.client.get(`seller:${id}`);
    return raw ? (JSON.parse(raw) as Seller) : undefined;
  }

  async saveSeller(seller: Seller): Promise<void> {
    await this.client.set(`seller:${seller.telegramId}`, JSON.stringify(seller));
  }

  async saveProduct(product: Product): Promise<void> {
    await this.client.set(`product:${product.id}`, JSON.stringify(product));
    const raw = await this.client.get(`seller_products:${product.submitterId}`);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    ids.push(product.id);
    await this.client.set(`seller_products:${product.submitterId}`, JSON.stringify(ids));
    if (product.status === "pending_review") {
      const inboxRaw = await this.client.get("inbox");
      const inbox: string[] = inboxRaw ? JSON.parse(inboxRaw) : [];
      inbox.push(product.id);
      await this.client.set("inbox", JSON.stringify(inbox));
    }
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const raw = await this.client.get(`product:${id}`);
    return raw ? (JSON.parse(raw) as Product) : undefined;
  }

  async updateProduct(product: Product): Promise<void> {
    await this.client.set(`product:${product.id}`, JSON.stringify(product));
  }

  async getSellerProductIds(sellerId: number): Promise<string[]> {
    const raw = await this.client.get(`seller_products:${sellerId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  async getInboxProductIds(): Promise<string[]> {
    const raw = await this.client.get("inbox");
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const results: string[] = [];
    for (const id of ids) {
      const p = await this.getProduct(id);
      if (p && p.status === "pending_review") results.push(id);
    }
    return results;
  }
}

// --- Factory ---

let _instance: ProductStorage | null = null;

export function getStorage(): ProductStorage {
  if (_instance) return _instance;
  const url = process.env.REDIS_URL;
  if (url) {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    _instance = new RedisStore(client as RedisLike);
  } else {
    _instance = new MemStore();
  }
  return _instance;
}

/** Reset the singleton (test-only). */
export function _resetStorage(): void {
  _instance = null;
}
