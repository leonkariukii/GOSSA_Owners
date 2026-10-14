import express from 'express';
import { getDashboard } from '../repos/dashboard.js';
import { emptyQuery, parse } from '../validation/schemas.js';

export function createDashboardRouter({ pool }) {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    parse(emptyQuery, req.query);
    const data = await getDashboard(pool, req.auth.garageId, req.auth.garage.timeZone);
    res.json({ data });
  });

  return router;
}
