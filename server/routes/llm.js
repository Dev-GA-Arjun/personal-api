import express from 'express';

function sendFeatureError(response, error) {
  const status = error instanceof RangeError || error instanceof TypeError ? 400 : 500;
  return response.status(status).json({ error: error.message });
}

export function createLlmRouter(getFeatures) {
  const router = express.Router();

  router.get('/nudge/:window', (request, response) => {
    try {
      return response.json(getFeatures().getNudge(request.params.window));
    } catch (error) {
      return sendFeatureError(response, error);
    }
  });

  router.post('/notes', (request, response) => {
    const { note } = request.body ?? {};
    if (typeof note !== 'string' || !note.trim()) {
      return response.status(400).json({ error: 'note must be a non-empty string' });
    }

    try {
      return response.status(201).json(getFeatures().addNote(note));
    } catch (error) {
      return sendFeatureError(response, error);
    }
  });

  router.get('/review/week', (_request, response) => {
    try {
      return response.json(getFeatures().getWeeklyReview());
    } catch (error) {
      return sendFeatureError(response, error);
    }
  });

  router.get('/suggestions', (_request, response) => {
    try {
      return response.json({ suggestions: getFeatures().getSuggestions() });
    } catch (error) {
      return sendFeatureError(response, error);
    }
  });

  return router;
}
