// A stable event ID bridges the two browser stores. A reload between the history
// write and the progress write replays the same event without a second check-in.
export function syncReadingReviewHistory(review, study, questions) {
  const round = review.data.round;
  if (!round) return;
  for (const result of round.results) {
    if (result.recorded) continue;
    const question = questions.find(q => q.id === result.questionId);
    if (!question) continue;
    const saved = study.record(question, round.mode === 'oral' ? 'recall' : round.mode, {
      eventId: result.eventId, at: result.at, score: result.score, ok: result.ok,
      rating: result.rating, assisted: result.hinted,
    });
    if (saved?.saved) review.markRecorded(result.eventId);
  }
}
