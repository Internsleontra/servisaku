import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const addressSchema = z.object({
  label: z.string().max(40).default('Home'),
  house_number: z.string().max(60).optional(),
  building: z.string().max(120).optional(),
  street: z.string().max(160).optional(),
  area: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  postal: z.string().max(20).optional(),
  country: z.string().max(80).optional(),
  landmark: z.string().max(160).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  is_default: z.boolean().optional(),
});

async function loadList(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return Array.isArray(u?.addresses) ? u.addresses : [];
}
async function saveList(userId, list) {
  await prisma.user.update({ where: { id: userId }, data: { addresses: list } });
}

// GET /api/addresses
router.get('/', async (req, res, next) => {
  try { res.json(await loadList(req.user.id)); } catch (err) { next(err); }
});

// POST /api/addresses
router.post('/', validate(addressSchema), async (req, res, next) => {
  try {
    const list = await loadList(req.user.id);
    const entry = { id: crypto.randomUUID(), ...req.body };
    // First address (or explicitly default) becomes the default.
    if (entry.is_default || list.length === 0) {
      list.forEach((a) => { a.is_default = false; });
      entry.is_default = true;
    }
    list.push(entry);
    await saveList(req.user.id, list);
    res.json(entry);
  } catch (err) { next(err); }
});

// PATCH /api/addresses/:id — update fields and/or set as default.
router.patch('/:id', validate(addressSchema.partial()), async (req, res, next) => {
  try {
    const list = await loadList(req.user.id);
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Address not found' });
    list[idx] = { ...list[idx], ...req.body };
    if (req.body.is_default) list.forEach((a, i) => { a.is_default = i === idx; });
    await saveList(req.user.id, list);
    res.json(list[idx]);
  } catch (err) { next(err); }
});

// DELETE /api/addresses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    let list = await loadList(req.user.id);
    const removed = list.find((a) => a.id === req.params.id);
    list = list.filter((a) => a.id !== req.params.id);
    // Keep a default if any remain.
    if (removed?.is_default && list.length && !list.some((a) => a.is_default)) list[0].is_default = true;
    await saveList(req.user.id, list);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
