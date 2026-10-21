export function exportMusicBackup(study, review) {
  return { ...study.exportBackup(), readingReview: review.exportBackup() };
}

export function importMusicBackup(value, study, review) {
  // Validate both parts before changing either store; v1 history-only backups work.
  study.validate(value);
  if (value.readingReview !== undefined) review.validate(value.readingReview);
  const savedStudy = study.importBackup(value);
  const savedReview = value.readingReview === undefined || review.importBackup(value.readingReview);
  return savedStudy && savedReview;
}
