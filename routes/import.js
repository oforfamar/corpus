import { Router } from 'express';
import multer from 'multer';
import { getExistingDatesForUser, importEntries } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

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

function sanitizeRow(obj) {
  const out = {};
  if (obj.date) out.date = String(obj.date).trim();
  for (const field of NUMERIC_FIELDS) {
    const val = obj[field];
    out[field] = (val === undefined || val === '') ? null : Number(val);
  }
  return out;
}

// POST /api/import
router.post('/', upload.single('file'), (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const text = req.file.buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV has no data rows' });
  }

  const headers = lines[0].split(',').map(h => h.trim());

  if (!headers.includes('date')) {
    return res.status(400).json({ error: 'CSV is missing a "date" column' });
  }

  const existingDates = getExistingDatesForUser(session.userId);

  const toInsert = [];
  let skipped = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // 1-indexed, accounting for header
    const values = lines[i].split(',');
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx]?.trim() ?? ''; });

    const data = sanitizeRow(obj);

    if (!data.date) {
      errors.push({ row: rowNum, reason: 'missing date' });
      continue;
    }

    if (existingDates.has(data.date)) {
      skipped++;
      continue;
    }

    data.user_id = session.userId;
    data.user_name = session.user?.name || 'Unknown';

    toInsert.push(data);
    // Add to local set so duplicate dates within the CSV itself are also skipped
    existingDates.add(data.date);
  }

  try {
    importEntries(toInsert);
  } catch (err) {
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }

  res.json({ imported: toInsert.length, skipped, errors });
});

export default router;
