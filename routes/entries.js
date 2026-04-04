import { Router } from 'express';
import {
  getAllEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
} from '../db.js';

const router = Router();

const NUMERIC_FIELDS = [
  'weight_kg', 'bmi', 'body_fat_pct', 'body_water_pct',
  'metabolic_age', 'bmr_kcal', 'physique_rating',
  'muscle_mass_kg', 'bone_mass_kg', 'visceral_fat',
  'left_arm_muscle_kg', 'left_arm_fat_pct',
  'right_arm_muscle_kg', 'right_arm_fat_pct',
  'left_leg_muscle_kg', 'left_leg_fat_pct',
  'right_leg_muscle_kg', 'right_leg_fat_pct',
  'trunk_muscle_kg', 'trunk_fat_pct',
];

function sanitize(body) {
  const out = {};
  if (body.date) out.date = String(body.date);
  for (const field of NUMERIC_FIELDS) {
    const val = body[field];
    out[field] = val === undefined || val === '' ? null : Number(val);
  }
  return out;
}

// GET /api/entries?user=<name>
router.get('/', (req, res) => {
  const user = req.query.user || null;
  const entries = getAllEntries(user);
  res.json(entries);
});

// POST /api/entries
router.post('/', (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const data = sanitize(req.body);
  if (!data.date) return res.status(400).json({ error: 'date is required' });

  data.user_id = session.userId;
  data.user_name = session.user?.name || 'Unknown';

  const entry = createEntry(data);
  res.status(201).json(entry);
});

// PUT /api/entries/:id
router.put('/:id', (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const existing = getEntryById(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  if (existing.user_id !== session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const data = sanitize(req.body);
  if (!data.date) return res.status(400).json({ error: 'date is required' });

  const updated = updateEntry(Number(req.params.id), data);
  res.json(updated);
});

// DELETE /api/entries/:id
router.delete('/:id', (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const existing = getEntryById(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  if (existing.user_id !== session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  deleteEntry(Number(req.params.id));
  res.status(204).send();
});

export default router;
