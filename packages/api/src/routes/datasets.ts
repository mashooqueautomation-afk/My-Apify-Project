import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { ExportService } from '../services/ExportService';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/datasets ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.name, d.item_count, d.size_bytes, d.fields, d.created_at, d.updated_at,
              r.actor_id, a.name as actor_name
       FROM datasets d
       LEFT JOIN runs r ON d.run_id = r.id
       LEFT JOIN actors a ON r.actor_id = a.id
       WHERE d.org_id = $1
       ORDER BY d.created_at DESC LIMIT 50`,
      [req.user!.orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/datasets/:id ────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      'SELECT * FROM datasets WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Dataset not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/datasets/:id/items ──────────────────────────────────────────
router.get('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { offset = '0', limit = '100', fields } = req.query as any;

    // Check access
    const ds = await db.query(
      'SELECT id, item_count FROM datasets WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!ds.rows.length) throw new AppError('Dataset not found', 404);

    let selectClause = 'di.data';
    if (fields) {
      // Project specific fields: ?fields=url,title,price
      const fieldList = (fields as string).split(',').map(f => f.trim());
      selectClause = `jsonb_build_object(${
        fieldList.map(f => `'${f}', di.data->>'${f}'`).join(', ')
      })`;
    }

    const result = await db.query(
      `SELECT di.id, ${selectClause} as data, di.created_at
       FROM dataset_items di
       WHERE di.dataset_id = $1
       ORDER BY di.id ASC
       LIMIT $2 OFFSET $3`,
      [req.params.id, Math.min(parseInt(limit), 1000), parseInt(offset)]
    );

    res.json({
      success: true,
      data: result.rows.map(r => r.data),
      meta: {
        total: ds.rows[0].item_count,
        offset: parseInt(offset),
        limit: parseInt(limit),
        count: result.rows.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/datasets/:id/items ─────────────────────────────────────────
// Used internally by workers to push items
router.post('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ds = await db.query(
      'SELECT id FROM datasets WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!ds.rows.length) throw new AppError('Dataset not found', 404);

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!items.length) throw new AppError('No items provided', 400);
    if (items.length > 1000) throw new AppError('Max 1000 items per batch', 400);

    // Bulk insert
    const values = items.map((_, i) => `($1, $${i + 2})`).join(', ');
    const params = [req.params.id, ...items.map(item => JSON.stringify(item))];

    await db.query(
      `INSERT INTO dataset_items (dataset_id, data) VALUES ${values}`,
      params
    );

    // Detect fields from first item
    const newFields = Object.keys(items[0] || {});

    // Update dataset metadata
    await db.query(
      `UPDATE datasets SET
         item_count = item_count + $1,
         size_bytes = size_bytes + $2,
         fields = (SELECT ARRAY(SELECT DISTINCT unnest(fields || $3::text[])) FROM datasets WHERE id = $4),
         updated_at = NOW()
       WHERE id = $4`,
      [items.length, JSON.stringify(items).length, newFields, req.params.id]
    );

    res.json({ success: true, data: { itemsAdded: items.length } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/datasets/:id/export ─────────────────────────────────────────
router.get('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format = 'json', includeMeta = 'false', columns, limit = '10000' } = req.query as any;

    const ds = await db.query(
      `SELECT d.id, d.name, d.item_count, d.fields, d.created_at,
              r.id AS run_id, r.duration_secs, r.stats, a.name AS actor_name, a.id AS actor_id
       FROM datasets d
       LEFT JOIN runs r ON d.run_id = r.id
       LEFT JOIN actors a ON r.actor_id = a.id
       WHERE d.id = $1 AND d.org_id = $2`,
      [req.params.id, req.user!.orgId]
    );
    if (!ds.rows.length) throw new AppError('Dataset not found', 404);

    const items = await db.query(
      'SELECT data FROM dataset_items WHERE dataset_id = $1 ORDER BY id ASC LIMIT $2',
      [req.params.id, Math.min(parseInt(limit, 10) || 10000, 100000)]
    );

    const data = items.rows.map(r => r.data);
    const selectedColumns = columns ? String(columns).split(',').map((value) => value.trim()).filter(Boolean) : undefined;
    const metadata = {
      datasetId: req.params.id,
      datasetName: ds.rows[0].name || `dataset-${req.params.id.slice(0, 8)}`,
      campaign: ds.rows[0].actor_name,
      campaignId: ds.rows[0].actor_id,
      totalRecords: ds.rows[0].item_count,
      exportedAt: new Date().toISOString(),
      durationSeconds: ds.rows[0].duration_secs,
      sourceUrls: ds.rows[0].stats?.source_urls ?? [],
    };
    const fileName = `${(ds.rows[0].name || `dataset-${req.params.id.slice(0, 8)}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      const buffer = ExportService.toCsv(data, { columns: selectedColumns });
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      res.set('Content-Length', String(buffer.byteLength));
      res.send(buffer);
    } else if (format === 'xls') {
      const buffer = ExportService.toExcel(data, { columns: selectedColumns, includeMeta: includeMeta === 'true', metadata, fileName });
      res.set('Content-Type', 'application/vnd.ms-excel');
      res.set('Content-Disposition', `attachment; filename="${fileName}.xls"`);
      res.set('Content-Length', String(buffer.byteLength));
      res.send(buffer);
    } else if (format === 'jsonl') {
      res.set('Content-Type', 'application/jsonl');
      res.set('Content-Disposition', `attachment; filename="${fileName}.jsonl"`);
      res.send(data.map(item => JSON.stringify(item)).join('\n'));
    } else {
      const payload = ExportService.toJson(data, {
        columns: selectedColumns,
        includeMeta: includeMeta === 'true',
        metadata,
      });
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', `attachment; filename="${fileName}.json"`);
      res.set('Content-Length', String(payload.byteLength));
      res.send(payload);
    }
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/datasets/:id ─────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      'DELETE FROM datasets WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Dataset not found', 404);
    res.json({ success: true, data: { message: 'Dataset deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
