import express from 'express';
import { notFound } from '../errors.js';
import { requireIfMatch, setEtag } from '../http/preconditions.js';
import { findGarage } from '../repos/garages.js';
import { updateGarage } from '../services/garage.js';
import { emptyQuery, garagePatchBody, parse } from '../validation/schemas.js';

function publicGarage(garage) {
  return { id: garage.id, name: garage.name, time_zone: garage.time_zone, version: garage.version };
}

export function createGarageRouter({ pool }) {
  const router = express.Router();

  router.get('/garage', async (req, res) => {
    parse(emptyQuery, req.query);
    const garage = await findGarage(pool, req.auth.garageId);
    if (!garage) {
      throw notFound('Garage not found.');
    }
    setEtag(res, garage.version);
    res.json({ data: publicGarage(garage) });
  });

  router.patch('/garage', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const changes = parse(garagePatchBody, req.body);
    const garage = await updateGarage(pool, { garageId: req.auth.garageId, expectedVersion, changes });
    setEtag(res, garage.version);
    res.json({ data: publicGarage(garage) });
  });

  return router;
}
