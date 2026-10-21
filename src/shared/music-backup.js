import { studyStore, readingReviewStore } from '../app/store.js';
import { exportMusicBackup } from '../services/music-backup.js';

export function downloadMusicBackup() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportMusicBackup(studyStore, readingReviewStore), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = '背诵打卡与复习进度-' + studyStore.dateKey() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
