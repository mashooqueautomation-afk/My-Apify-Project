import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { STORE_APPS, getStoreApp } from '../catalog/storeCatalog';

const router = Router();
router.use(authenticate);

function makeActorSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.get('/apps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, featured, search } = req.query as Record<string, string | undefined>;
    let apps = [...STORE_APPS];

    if (category) {
      apps = apps.filter((app) => app.category === category);
    }
    if (featured === 'true') {
      apps = apps.filter((app) => app.featured);
    }
    if (search) {
      const term = search.toLowerCase();
      apps = apps.filter((app) =>
        [app.name, app.tagline, app.description, ...app.tags, ...app.targets].some((value) =>
          value.toLowerCase().includes(term)
        )
      );
    }

    res.json({
      success: true,
      data: apps,
      meta: {
        total: apps.length,
        categories: Array.from(new Set(STORE_APPS.map((app) => app.category))),
        featured: STORE_APPS.filter((app) => app.featured).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/apps/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const app = getStoreApp(req.params.slug);
    if (!app) throw new AppError('Store app not found', 404);
    res.json({ success: true, data: app });
  } catch (error) {
    next(error);
  }
});

router.post('/apps/:slug/install', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const app = getStoreApp(req.params.slug);
    if (!app) throw new AppError('Store app not found', 404);

    const sourcePath = path.resolve(__dirname, '../../../worker/src/actors', app.sourcePath);
    const sourceCode = await fs.readFile(sourcePath, 'utf8');

    const actorName = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : app.name;
    const slugBase = makeActorSlug(actorName);

    const existingCount = await db.query(
      'SELECT COUNT(*)::int AS count FROM actors WHERE org_id = $1 AND slug LIKE $2',
      [req.user!.orgId, `${slugBase}%`]
    );
    const suffix = existingCount.rows[0].count > 0 ? `-${existingCount.rows[0].count + 1}` : '';
    const actorSlug = `${slugBase}${suffix}`;

    const result = await db.query(
      `INSERT INTO actors (
         org_id, owner_id, name, slug, description, runtime, source_code,
         input_schema, is_public, tags, default_run_options, status, category, readme
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, false, $9, $10::jsonb, 'active', $11, $12
       )
       RETURNING id, name, slug, status, runtime, created_at`,
      [
        req.user!.orgId,
        req.user!.userId,
        actorName,
        actorSlug,
        app.description,
        app.runtime,
        sourceCode,
        JSON.stringify({
          example: app.defaultInput,
          source: 'mash-store',
          targets: app.targets,
          useCases: app.useCases,
        }),
        app.tags,
        JSON.stringify(app.defaultRunOptions),
        app.category,
        `# ${app.name}\n\n${app.description}\n\nTargets: ${app.targets.join(', ')}\n\nUse cases: ${app.useCases.join(', ')}`,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        actor: result.rows[0],
        installedFrom: app.slug,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
