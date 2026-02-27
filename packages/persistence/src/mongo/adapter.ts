import { randomUUID } from "node:crypto";
import { Collection, Db, MongoClient, type MongoClientOptions } from "mongodb";
import type {
  GenerationLogRecord,
  MessageRecord,
  ThreadBundle,
  ThreadRecord,
  VersionRecord
} from "@repo/contracts";
import type {
  CreateThreadInput,
  PersistGenerationInput,
  PersistenceAdapter,
  RecordGenerationFailureInput
} from "../interfaces";

interface CollectionNames {
  threads: string;
  messages: string;
  versions: string;
  generationLogs: string;
}

interface MongoDocuments {
  thread: ThreadRecord & { _id?: unknown };
  message: MessageRecord & { _id?: unknown };
  version: VersionRecord & { _id?: unknown };
  generationLog: GenerationLogRecord & { _id?: unknown };
}

const DEFAULT_COLLECTION_NAMES: CollectionNames = {
  threads: "threads",
  messages: "messages",
  versions: "versions",
  generationLogs: "generationLogs"
};

export interface MongoPersistenceAdapterOptions {
  collectionNames?: Partial<CollectionNames>;
  now?: () => string;
  idFactory?: () => string;
  client?: MongoClient;
}

export interface MongoPersistenceFromUriOptions extends Omit<MongoPersistenceAdapterOptions, "client"> {
  uri: string;
  dbName: string;
  clientOptions?: MongoClientOptions;
}

function createInitialSpec(): VersionRecord["specSnapshot"] {
  return {
    root: "",
    elements: {}
  };
}

function toThreadRecord(doc: MongoDocuments["thread"]): ThreadRecord {
  return {
    threadId: doc.threadId,
    title: doc.title,
    activeVersionId: doc.activeVersionId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function toMessageRecord(doc: MongoDocuments["message"]): MessageRecord {
  return {
    id: doc.id,
    threadId: doc.threadId,
    generationId: doc.generationId,
    role: doc.role,
    content: doc.content,
    reasoning: doc.reasoning,
    createdAt: doc.createdAt,
    meta: doc.meta
  };
}

function toVersionRecord(doc: MongoDocuments["version"]): VersionRecord {
  return {
    versionId: doc.versionId,
    threadId: doc.threadId,
    baseVersionId: doc.baseVersionId,
    specSnapshot: doc.specSnapshot,
    specHash: doc.specHash,
    mcpContextUsed: doc.mcpContextUsed,
    createdAt: doc.createdAt
  };
}

export class MongoPersistenceAdapter implements PersistenceAdapter {
  private readonly threads: Collection<MongoDocuments["thread"]>;
  private readonly messages: Collection<MongoDocuments["message"]>;
  private readonly versions: Collection<MongoDocuments["version"]>;
  private readonly generationLogs: Collection<MongoDocuments["generationLog"]>;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly client?: MongoClient;

  public constructor(db: Db, options: MongoPersistenceAdapterOptions = {}) {
    const names = {
      ...DEFAULT_COLLECTION_NAMES,
      ...options.collectionNames
    };

    this.threads = db.collection<MongoDocuments["thread"]>(names.threads);
    this.messages = db.collection<MongoDocuments["message"]>(names.messages);
    this.versions = db.collection<MongoDocuments["version"]>(names.versions);
    this.generationLogs = db.collection<MongoDocuments["generationLog"]>(names.generationLogs);
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.client = options.client;
  }

  public static async connect(
    options: MongoPersistenceFromUriOptions
  ): Promise<MongoPersistenceAdapter> {
    const client = new MongoClient(options.uri, options.clientOptions);
    await client.connect();

    return new MongoPersistenceAdapter(client.db(options.dbName), {
      collectionNames: options.collectionNames,
      idFactory: options.idFactory,
      now: options.now,
      client
    });
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  public async createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    const threadId = this.idFactory();
    const initialVersionId = this.idFactory();
    const timestamp = this.now();

    const thread: ThreadRecord = {
      threadId,
      title: input.title ?? "Untitled Thread",
      activeVersionId: initialVersionId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const initialVersion: VersionRecord = {
      versionId: initialVersionId,
      threadId,
      baseVersionId: null,
      specSnapshot: createInitialSpec(),
      specHash: "",
      mcpContextUsed: [],
      createdAt: timestamp
    };

    await this.threads.insertOne(thread);
    await this.versions.insertOne(initialVersion);

    return thread;
  }

  public async getThreadBundle(threadId: string): Promise<ThreadBundle | null> {
    const thread = await this.threads.findOne({ threadId });
    if (!thread) {
      return null;
    }

    const messages = await this.messages.find({ threadId }).sort({ createdAt: 1 }).toArray();
    const versions = await this.versions.find({ threadId }).sort({ createdAt: -1 }).toArray();

    return {
      thread: toThreadRecord(thread),
      messages: messages.map(toMessageRecord),
      versions: versions.map(toVersionRecord)
    };
  }

  public async getVersion(threadId: string, versionId: string | null): Promise<VersionRecord | null> {
    if (versionId) {
      const version = await this.versions.findOne({ threadId, versionId });
      return version ? toVersionRecord(version) : null;
    }

    const thread = await this.threads.findOne({ threadId });
    if (!thread) {
      return null;
    }

    const active = await this.versions.findOne({
      threadId,
      versionId: thread.activeVersionId
    });

    return active ? toVersionRecord(active) : null;
  }

  public async persistGeneration(
    input: PersistGenerationInput
  ): Promise<{ version: VersionRecord; message: MessageRecord; log: GenerationLogRecord }> {
    const thread = await this.threads.findOne({ threadId: input.threadId });
    if (!thread) {
      throw new Error(`Thread '${input.threadId}' not found.`);
    }

    const timestamp = this.now();

    const userMessage: MessageRecord = {
      id: this.idFactory(),
      threadId: input.threadId,
      generationId: input.generationId,
      role: "user",
      content: input.prompt,
      createdAt: timestamp
    };

    const assistantMessage: MessageRecord = {
      id: this.idFactory(),
      threadId: input.threadId,
      generationId: input.generationId,
      role: "assistant",
      content: input.assistantResponseText,
      reasoning: input.assistantReasoningText,
      createdAt: timestamp,
      meta: {
        warningCount: input.warnings.length,
        patchCount: input.patchCount,
        durationMs: input.durationMs,
        specHash: input.specHash,
        mcpContextUsed: input.mcpContextUsed
      }
    };

    const version: VersionRecord = {
      versionId: this.idFactory(),
      threadId: input.threadId,
      baseVersionId: input.baseVersionId,
      specSnapshot: input.specSnapshot,
      specHash: input.specHash,
      mcpContextUsed: input.mcpContextUsed,
      createdAt: timestamp
    };

    const log: GenerationLogRecord = {
      id: this.idFactory(),
      generationId: input.generationId,
      threadId: input.threadId,
      warningCount: input.warnings.length,
      patchCount: input.patchCount,
      durationMs: input.durationMs,
      createdAt: timestamp
    };

    await this.messages.insertMany([userMessage, assistantMessage]);
    await this.versions.insertOne(version);
    await this.generationLogs.insertOne(log);

    const updateResult = await this.threads.updateOne(
      { threadId: input.threadId },
      {
        $set: {
          activeVersionId: version.versionId,
          updatedAt: timestamp
        }
      }
    );

    if (updateResult.matchedCount !== 1) {
      throw new Error(`Thread '${input.threadId}' not found.`);
    }

    return {
      version,
      message: assistantMessage,
      log
    };
  }

  public async recordGenerationFailure(
    input: RecordGenerationFailureInput
  ): Promise<GenerationLogRecord> {
    const thread = await this.threads.findOne({ threadId: input.threadId });
    if (!thread) {
      throw new Error(`Thread '${input.threadId}' not found.`);
    }

    const log: GenerationLogRecord = {
      id: this.idFactory(),
      generationId: input.generationId,
      threadId: input.threadId,
      warningCount: input.warningCount,
      patchCount: input.patchCount,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      createdAt: this.now()
    };

    await this.generationLogs.insertOne(log);
    return log;
  }

  public async revertThread(threadId: string, targetVersionId: string): Promise<VersionRecord> {
    const thread = await this.threads.findOne({ threadId });
    if (!thread) {
      throw new Error(`Thread '${threadId}' not found.`);
    }

    const target = await this.versions.findOne({
      threadId,
      versionId: targetVersionId
    });

    if (!target) {
      throw new Error(`Version '${targetVersionId}' not found.`);
    }

    const timestamp = this.now();
    const revertVersion: VersionRecord = {
      versionId: this.idFactory(),
      threadId,
      baseVersionId: targetVersionId,
      specSnapshot: structuredClone(target.specSnapshot),
      specHash: target.specHash,
      mcpContextUsed: target.mcpContextUsed,
      createdAt: timestamp
    };

    await this.versions.insertOne(revertVersion);

    const updateResult = await this.threads.updateOne(
      { threadId },
      {
        $set: {
          activeVersionId: revertVersion.versionId,
          updatedAt: timestamp
        }
      }
    );

    if (updateResult.matchedCount !== 1) {
      throw new Error(`Thread '${threadId}' not found.`);
    }

    return revertVersion;
  }
}
