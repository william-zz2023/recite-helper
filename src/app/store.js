import { createStudyStore } from '../services/study-history.js';

// Preserve the existing music storage key and v1 backup format.
export const studyStore = createStudyStore();
