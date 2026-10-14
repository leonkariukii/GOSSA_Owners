import express from 'express';
import { notFound } from '../errors.js';
import { requireIfMatch, setEtag } from '../http/preconditions.js';
import { findMechanic, listMechanics } from '../repos/mechanics.js';
import {
  archiveMechanic,
  createMechanic,
  markAvailable,
  markOffDuty,
  updateMechanic,
} from '../services/mechanics.js';
import { mechanicCreateBody, mechanicListQuery, mechanicPatchBody, parse } from '../validation/schemas.js';

export function createMechanicsRouter({ pool }) {
  const router = express.Router();

  const respond = (res, mechanic, status = 200) => {
    setEtag(res, mechanic.version);
    res.status(status).json({ data: mechanic });
  };

  router.get('/mechanics', async (req, res) => {
    const q = parse(mechanicListQuery, req.query);
    const query = {
      page: q.page ?? 1,
      pageSize: q.page_size ?? 25,
      sortBy: q.sort_by ?? 'updated_at',
      order: q.order ?? 'desc',
      q: q.q,
      dutyStatus: q.duty_status,
      includeArchived: q.include_archived === 'true',
    };
    const { rows, total } = await listMechanics(pool, req.auth.garageId, query);
    res.json({ data: rows, page: query.page, page_size: query.pageSize, total });
  });

  router.post('/mechanics', async (req, res) => {
    const input = parse(mechanicCreateBody, req.body);
    const mechanic = await createMechanic(pool, { garageId: req.auth.garageId, input });
    res.location(`/api/v1/mechanics/${mechanic.id}`);
    respond(res, mechanic, 201);
  });

  router.get('/mechanics/:id', async (req, res) => {
    const mechanic = await findMechanic(pool, req.auth.garageId, req.params.id);
    if (!mechanic) {
      throw notFound('Mechanic not found.');
    }
    respond(res, mechanic);
  });

  router.patch('/mechanics/:id', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const changes = parse(mechanicPatchBody, req.body);
    const mechanic = await updateMechanic(pool, {
      garageId: req.auth.garageId,
      id: req.params.id,
      expectedVersion,
      changes,
    });
    respond(res, mechanic);
  });

  const actions = {
    'off-duty': markOffDuty,
    available: markAvailable,
    archive: archiveMechanic,
  };
  for (const [path, action] of Object.entries(actions)) {
    router.post(`/mechanics/:id/${path}`, async (req, res) => {
      const expectedVersion = requireIfMatch(req);
      const mechanic = await action(pool, { garageId: req.auth.garageId, id: req.params.id, expectedVersion });
      respond(res, mechanic);
    });
  }

  return router;
}
