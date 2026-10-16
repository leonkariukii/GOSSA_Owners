import express from 'express';
import { notFound } from '../errors.js';
import { requireIfMatch, setEtag } from '../http/preconditions.js';
import { findJob, listHistory, listJobs } from '../repos/jobs.js';
import { archiveJob, assignMechanic, createJob, transitionJob, updateJob } from '../services/jobs.js';
import {
  assignmentBody,
  historyQuery,
  jobCreateBody,
  jobListQuery,
  jobPatchBody,
  parse,
  transitionBody,
} from '../validation/schemas.js';

export function createJobsRouter({ pool }) {
  const router = express.Router();

  const respond = (res, job, status = 200) => {
    setEtag(res, job.version);
    res.status(status).json({ data: job });
  };

  router.get('/jobs', async (req, res) => {
    const q = parse(jobListQuery, req.query);
    const query = {
      page: q.page ?? 1,
      pageSize: q.page_size ?? 25,
      sortBy: q.sort_by ?? 'updated_at',
      order: q.order ?? 'desc',
      q: q.q,
      status: q.status,
      mechanicId: q.mechanic_id,
      includeArchived: q.include_archived === 'true',
      createdFrom: q.created_from,
      createdTo: q.created_to,
    };
    const { rows, total } = await listJobs(pool, req.auth.garageId, req.auth.garage.timeZone, query);
    res.json({ data: rows, page: query.page, page_size: query.pageSize, total });
  });

  router.post('/jobs', async (req, res) => {
    const input = parse(jobCreateBody, req.body);
    const job = await createJob(pool, { garageId: req.auth.garageId, userId: req.auth.user.id, input });
    res.location(`/api/v1/jobs/${job.id}`);
    respond(res, job, 201);
  });

  router.get('/jobs/:id', async (req, res) => {
    const job = await findJob(pool, req.auth.garageId, req.params.id);
    if (!job) {
      throw notFound('Job not found.');
    }
    respond(res, job);
  });

  router.patch('/jobs/:id', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const changes = parse(jobPatchBody, req.body);
    const job = await updateJob(pool, { garageId: req.auth.garageId, jobId: req.params.id, expectedVersion, changes });
    respond(res, job);
  });

  router.post('/jobs/:id/assignment', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const { mechanic_id: mechanicId } = parse(assignmentBody, req.body);
    const job = await assignMechanic(pool, {
      garageId: req.auth.garageId,
      jobId: req.params.id,
      expectedVersion,
      mechanicId,
    });
    respond(res, job);
  });

  router.post('/jobs/:id/transitions', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const { to_status: toStatus, note } = parse(transitionBody, req.body);
    const job = await transitionJob(pool, {
      garageId: req.auth.garageId,
      userId: req.auth.user.id,
      jobId: req.params.id,
      expectedVersion,
      toStatus,
      note,
    });
    respond(res, job);
  });

  router.get('/jobs/:id/history', async (req, res) => {
    const q = parse(historyQuery, req.query);
    const job = await findJob(pool, req.auth.garageId, req.params.id);
    if (!job) {
      throw notFound('Job not found.');
    }
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 25;
    const { rows, total } = await listHistory(pool, req.auth.garageId, job.id, { page, pageSize });
    res.json({ data: rows, page, page_size: pageSize, total });
  });

  router.post('/jobs/:id/archive', async (req, res) => {
    const expectedVersion = requireIfMatch(req);
    const job = await archiveJob(pool, { garageId: req.auth.garageId, jobId: req.params.id, expectedVersion });
    respond(res, job);
  });

  return router;
}
