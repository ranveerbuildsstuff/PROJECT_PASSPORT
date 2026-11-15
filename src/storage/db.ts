import Dexie, { type Table } from 'dexie';
import type { PassportV1, CheckpointFileItem, CheckpointKindType } from '../domain';

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: string;
  status: 'idea' | 'in_progress' | 'paused' | 'done';
}

export interface PassportRecord {
  projectId: string;
  passport: PassportV1;
}

export interface CheckpointRecord {
  id: string;
  projectId: string;
  createdAt: string;
  type?: CheckpointKindType;
  note?: string;
  description?: string;
  passport?: PassportV1;
  conversationIds?: string[];
  files?: CheckpointFileItem[];
  [key: string]: unknown;
}

export interface ConversationMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
}

export interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  source: 'chatgpt' | 'claude' | 'gemini' | 'paste' | 'other';
  messages: ConversationMessage[];
  createdAt: string;
}

export interface FileRecord {
  id: string;
  projectId: string;
  path: string;
  mime: string;
  content: string | Uint8Array;
  sizeBytes: number;
  acknowledgedFindings?: string[];
}

export class PassportDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;
  passports!: Table<PassportRecord, string>;
  checkpoints!: Table<CheckpointRecord, string>;
  conversations!: Table<ConversationRecord, string>;
  files!: Table<FileRecord, string>;

  constructor(dbName = 'ProjectPassportDB') {
    super(dbName);
    this.version(1).stores({
      projects: 'id, name, updatedAt, status',
      passports: 'projectId',
      checkpoints: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt',
      files: 'id, projectId, path',
    });
  }
}

export const db = new PassportDatabase();
