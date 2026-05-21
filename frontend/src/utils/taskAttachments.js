import { tasksApi } from "../services/api";


export function hasTaskAttachmentChanges(changes = {}) {
  return Boolean(changes.pendingFiles?.length || changes.removedAttachmentIds?.length);
}


export async function applyTaskAttachmentChanges(taskId, changes = {}) {
  const removedAttachmentIds = changes.removedAttachmentIds || [];
  const pendingFiles = changes.pendingFiles || [];

  for (const attachmentId of removedAttachmentIds) {
    await tasksApi.deleteAttachment(taskId, attachmentId);
  }

  for (const file of pendingFiles) {
    await tasksApi.uploadAttachment(taskId, file);
  }

  return hasTaskAttachmentChanges(changes);
}
