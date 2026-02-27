import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import type { GenerationLogRecord, MessageRecord, ThreadRecord, VersionRecord } from "@repo/contracts";
import { MongoPersistenceAdapter } from "./adapter";

type ThreadDoc = ThreadRecord & { _id?: unknown };
type MessageDoc = MessageRecord & { _id?: unknown };
type VersionDoc = VersionRecord & { _id?: unknown };
type GenerationLogDoc = GenerationLogRecord & { _id?: unknown };

interface UpdateResult {
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
  upsertedId: null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matchesFilter<T extends object>(doc: T, filter: Partial<T>): boolean {
  const docRecord = doc as Record<string, unknown>;
  const filterRecord = filter as Record<string, unknown>;
  return Object.entries(filterRecord).every(([key, value]) => docRecord[key] === value);
}

function createCollection<T extends object>(seed: T[] = []) {
  const docs = seed.map(clone);

  return {
    async insertOne(doc: T) {
      docs.push(clone(doc));
      return {
        acknowledged: true as const,
        insertedId: "mock-id"
      };
    },
    async insertMany(newDocs: T[]) {
      for (const doc of newDocs) {
        docs.push(clone(doc));
      }

      return {
        acknowledged: true as const,
        insertedCount: newDocs.length,
        insertedIds: {}
      };
    },
    async findOne(filter: Partial<T>) {
      const hit = docs.find((doc) => matchesFilter(doc, filter));
      return hit ? clone(hit) : null;
    },
    find(filter: Partial<T>) {
      const filtered = docs.filter((doc) => matchesFilter(doc, filter));
      return {
        sort(sortSpec: Record<string, 1 | -1>) {
          const sorted = [...filtered];
          const firstSort = Object.entries(sortSpec)[0];

          if (firstSort) {
            const [field, direction] = firstSort;
            sorted.sort((left, right) => {
              const leftValue = left[field as keyof T];
              const rightValue = right[field as keyof T];

              if (leftValue === rightValue) {
                return 0;
              }

              if (typeof leftValue === "string" && typeof rightValue === "string") {
                return direction * leftValue.localeCompare(rightValue);
              }

              const leftComparable = String(leftValue);
              const rightComparable = String(rightValue);
              return direction * leftComparable.localeCompare(rightComparable);
            });
          }

          return {
            async toArray() {
              return sorted.map(clone);
            }
          };
        },
        async toArray() {
          return filtered.map(clone);
        }
      };
    },
    async updateOne(filter: Partial<T>, update: { $set?: Partial<T> }): Promise<UpdateResult> {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter));
      if (index < 0) {
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 0,
          upsertedId: null
        };
      }

      const current = docs[index];
      if (!current) {
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 0,
          upsertedId: null
        };
      }

      docs[index] = {
        ...current,
        ...update.$set
      };

      return {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
        upsertedId: null
      };
    }
  };
}

function createFakeDb(collections: Record<string, unknown>): Db {
  return {
    collection(name: string) {
      const collection = collections[name];
      if (!collection) {
        throw new Error(`Missing fake collection: ${name}`);
      }

      return collection;
    }
  } as unknown as Db;
}

describe("MongoPersistenceAdapter", () => {
  it("persists create/generate/revert flow against mongo-style collections", async () => {
    const threads = createCollection<ThreadDoc>();
    const messages = createCollection<MessageDoc>();
    const versions = createCollection<VersionDoc>();
    const generationLogs = createCollection<GenerationLogDoc>();

    const db = createFakeDb({
      threads,
      messages,
      versions,
      generationLogs
    });

    let idCounter = 0;
    const adapter = new MongoPersistenceAdapter(db, {
      now: () => "2026-02-27T00:00:00.000Z",
      idFactory: () => {
        idCounter += 1;
        return `id-${idCounter}`;
      }
    });

    const thread = await adapter.createThread({ title: "Test Thread" });
    expect(thread.threadId).toBe("id-1");
    expect(thread.activeVersionId).toBe("id-2");

    const persisted = await adapter.persistGeneration({
      threadId: thread.threadId,
      generationId: "gen-1",
      prompt: "Build a pricing card",
      baseVersionId: thread.activeVersionId,
      specSnapshot: {
        root: "root",
        elements: {
          root: {
            type: "Card",
            props: {},
            children: []
          }
        }
      },
      specHash: "hash-1",
      mcpContextUsed: ["Card", "Button"],
      warnings: [],
      patchCount: 3
    });

    expect(persisted.version.versionId).toBe("id-5");
    expect(persisted.message.role).toBe("assistant");
    expect(persisted.log.patchCount).toBe(3);

    const failureLog = await adapter.recordGenerationFailure({
      threadId: thread.threadId,
      generationId: "gen-2",
      warningCount: 1,
      patchCount: 0,
      errorCode: "GENERATION_EXCEPTION"
    });
    expect(failureLog.errorCode).toBe("GENERATION_EXCEPTION");

    const reverted = await adapter.revertThread(thread.threadId, persisted.version.versionId);
    expect(reverted.versionId).toBe("id-8");

    const bundle = await adapter.getThreadBundle(thread.threadId);
    const logs = await generationLogs.find({ threadId: thread.threadId }).toArray();
    expect(bundle).not.toBeNull();
    expect(bundle?.thread.activeVersionId).toBe("id-8");
    expect(bundle?.versions.length).toBe(3);
    expect(bundle?.messages.length).toBe(2);
    expect(logs.length).toBe(2);
    expect(logs.some((log) => log.errorCode === "GENERATION_EXCEPTION")).toBe(true);
  });
});
