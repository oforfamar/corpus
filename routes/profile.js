import { Router } from 'express';
import { getProfile, upsertProfile } from '../db.js';

const router = Router();

// GET /api/profile — current user's profile
router.get('/', (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const profile = getProfile(session.user.id);
  res.json(profile);
});

// PUT /api/profile — upsert current user's profile
router.put('/', (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { date_of_birth, height_cm, sex } = req.body;

  if (!date_of_birth || !height_cm || !sex) {
    return res.status(400).json({ error: 'date_of_birth, height_cm and sex are required' });
  }
  if (!['male', 'female'].includes(sex)) {
    return res.status(400).json({ error: 'sex must be "male" or "female"' });
  }

  const profile = upsertProfile(session.user.id, {
    user_name: session.user.name,
    date_of_birth,
    height_cm,
    sex,
  });

  res.json(profile);
});

export default router;
