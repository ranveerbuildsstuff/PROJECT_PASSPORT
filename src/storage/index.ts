export {
  createProject,
  listProjects,
  getProject,
  renameProject,
  deleteProject,
  getPassport,
  savePassport,
  addConversation,
  listConversations,
  getConversation,
  removeConversation,
  addFile,
  listFiles,
  getFile,
  removeFile,
  exportEverything,
  importBackup,
  requestPersistentStorage,
  getStorageUsage,
  isAvailable,
  type BackupData,
  type BackupProjectItem,
  type BackupFileRecord,
  type ImportBackupResult,
  type StorageUsage,
} from './storageService';

export {
  StorageUnavailable,
  ValidationFailed,
  QuotaExceeded,
  BackupInvalid,
  ProjectNotFound,
} from './errors';

export type {
  ProjectRecord,
  PassportRecord,
  CheckpointRecord,
  ConversationMessage,
  ConversationRecord,
  FileRecord,
} from './db';
