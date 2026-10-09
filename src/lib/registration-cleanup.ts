type CleanupOperations = {
  pending: () => Promise<string[]>;
  remove: (paths: string[]) => Promise<void>;
  acknowledge: (paths: string[]) => Promise<void>;
};

export async function cleanupRegistrationFiles(operations: CleanupOperations): Promise<void> {
  // The server returns only queued paths that no remaining record references.
  const paths = await operations.pending();
  if (!paths.length) return;
  await operations.remove(paths);
  await operations.acknowledge(paths);
}

export async function deleteThenCleanup(deleteRecord: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  // A rejected deletion must never touch storage. The RPC commits the deletion
  // and its cleanup queue together before any file is removed.
  await deleteRecord();
  await cleanup().catch(() => {
    // The committed deletion succeeded. Pending files remain queued for retry
    // when registration applications are loaded again.
    console.warn('Registration file cleanup pending retry.');
  });
}
