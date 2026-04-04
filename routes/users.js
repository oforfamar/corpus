import { Router } from 'express';
import { getDistinctUsers } from '../db.js';

const router = Router();

// GET /api/users — returns list of distinct user names that have entries
router.get('/', (req, res) => {
  const users = getDistinctUsers();
  res.json(users);
});

export default router;
