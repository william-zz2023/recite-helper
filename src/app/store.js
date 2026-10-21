import { createStudyStore } from '../services/study-history.js';
import { createReadingReview } from '../services/reading-review.js';

// Preserve the existing music storage key and v1 backup format.
export const studyStore = createStudyStore();
export const readingReviewStore = createReadingReview();
