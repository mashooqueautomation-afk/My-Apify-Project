import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { db } from '../db/pool';
import { AppError } from '../utils/AppError';
import { RunService } from '../services/RunService';
import { enqueueRun } from '../workers/queues';
import { ExportService } from '../services/ExportService';

const router = Router();

router.use(authenticate);

const CampaignSchema = z.object({
  name: z.string().min(2).max(255),

  description: z.string().optional(),

  runtime: z
    .enum([
      'node18',
      'python310',
      'playwright',
      'custom',
    ])
    .default('playwright'),

  status: z
    .enum([
      'draft',
      'active',
    ])
    .default('active'),

  sourceCode:
    z.string().optional(),

  inputSchema: z
    .record(z.any())
    .optional()
    .default({}),

  isPublic:
    z.boolean().default(false),

  tags: z
    .array(z.string())
    .default([]),

  defaultRunOptions:
    z
      .object({
        memoryMbytes:
          z.number().default(
            1024
          ),

        timeoutSecs:
          z.number().default(
            3600
          ),
      })
      .default({}),
});

const RunSchema = z.object({
  input: z.record(z.any()).default({}),

  options: z
    .object({
      memoryMbytes: z
        .number()
        .min(128)
        .max(32768)
        .default(1024),

      timeoutSecs: z
        .number()
        .min(10)
        .max(86400)
        .default(3600),

      proxyGroupId: z
        .string()
        .uuid()
        .optional(),
    })
    .default({}),
});

function createSlug(
  name: string
) {
  return name
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      '-'
    )
    .replace(/-+/g, '-');
}

router.get(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {
        search,
        status,
      } = req.query as any;

      let query = `
SELECT
a.id,
a.name,
a.slug,
a.description,
a.runtime,
a.status,
a.tags,
a.total_runs,
a.success_runs,
a.avg_duration_secs,
a.created_at,
a.updated_at

FROM actors a

WHERE
a.org_id = $1
AND a.status != 'archived'
`;

      const values: any[] = [
        req.user!.orgId,
      ];

      if (status) {
        values.push(status);

        query += `
AND a.status = $${
  values.length
}
`;
      }

      if (search) {
        values.push(
          `%${search}%`
        );

        query += `
AND (
a.name ILIKE $${
  values.length
}
OR
a.description ILIKE $${
  values.length
}
)
`;
      }

      query += `
ORDER BY
a.updated_at DESC
`;

      const result =
        await db.query(
          query,
          values
        );

      res.json({
        success: true,

        data: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const body =
        CampaignSchema.parse(
          req.body
        );

      const result =
        await db.query(
          `
INSERT INTO actors (
org_id,
owner_id,
name,
slug,
description,
runtime,
source_code,
input_schema,
is_public,
tags,
default_run_options,
status
)

VALUES (
$1,
$2,
$3,
$4,
$5,
$6,
$7,
$8,
$9,
$10,
$11,
$12
)

RETURNING *
`,
          [
            req.user!.orgId,

            req.user!.userId,

            body.name,

            createSlug(
              body.name
            ),

            body.description ||
              null,

            body.runtime,

            body.sourceCode ||
              null,

            JSON.stringify(
              body.inputSchema
            ),

            body.isPublic,

            body.tags,

            JSON.stringify(
              body.defaultRunOptions
            ),

            body.status,
          ]
        );

      res.status(201).json({
        success: true,

        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:campaignId',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result =
        await db.query(
          `
SELECT *
FROM actors

WHERE
id = $1
AND org_id = $2
AND status != 'archived'
`,
          [
            req.params
              .campaignId,

            req.user!.orgId,
          ]
        );

      if (
        !result.rows.length
      ) {
        throw new AppError(
          'Campaign not found',
          404
        );
      }

      res.json({
        success: true,

        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:campaignId',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const allowed = [
        'name',

        'description',

        'status',

        'runtime',

        'source_code',

        'input_schema',

        'default_run_options',

        'tags',

        'is_public',
      ];

      const updates =
        Object.entries(
          req.body || {}
        ).filter(([key]) =>
          allowed.includes(
            key
          )
        );

      if (!updates.length) {
        throw new AppError(
          'No valid fields to update',
          400
        );
      }

      const values: any[] = [
        req.params
          .campaignId,

        req.user!.orgId,
      ];

      const setClause =
        updates
          .map(
            ([
              key,
              value,
            ]) => {
              values.push(
                typeof value ===
                  'object'
                  ? JSON.stringify(
                      value
                    )
                  : value
              );

              return `${key} = $${
                values.length
              }`;
            }
          )
          .join(', ');

      const result =
        await db.query(
          `
UPDATE actors

SET
${setClause},
updated_at = NOW()

WHERE
id = $1
AND org_id = $2

RETURNING *
`,
          values
        );

      if (
        !result.rows.length
      ) {
        throw new AppError(
          'Campaign not found',
          404
        );
      }

      res.json({
        success: true,

        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:campaignId',

  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result =
        await db.query(
          `
UPDATE actors

SET
status = 'archived',
updated_at = NOW()

WHERE
id = $1
AND org_id = $2

RETURNING id
`,
          [
            req.params
              .campaignId,

            req.user!.orgId,
          ]
        );

      if (
        !result.rows.length
      ) {
        throw new AppError(
          'Campaign not found',
          404
        );
      }

      res.json({
        success: true,

        data: {
          message:
            'Campaign archived',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:campaignId/run',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {
        input,
        options,
      } = RunSchema.parse(
        req.body
      );

      const actorResult =
        await db.query(
          `
SELECT *
FROM actors

WHERE
id = $1
AND org_id = $2
AND status != 'archived'
`,
          [
            req.params
              .campaignId,

            req.user!.orgId,
          ]
        );

      if (
        !actorResult.rows.length
      ) {
        throw new AppError(
          'Campaign not found',
          404
        );
      }

      const actor =
        actorResult.rows[0];

      const run =
        await RunService.createRun(
          {
            actorId:
              actor.id,

            orgId:
              req.user!.orgId,

            userId:
              req.user!.userId,

            input,

            options: {
              memoryMbytes:
                options.memoryMbytes,

              timeoutSecs:
                options.timeoutSecs,

              dockerImage:
                actor.docker_image,

              proxyGroupId:
                options.proxyGroupId,
            },
          }
        );

      await enqueueRun({
        runId: run.id,

        actorId: actor.id,

        actorSlug:
          actor.slug,

        orgId:
          req.user!.orgId,

        userId:
          req.user!.userId,

        input,

        options: {
          memoryMbytes:
            options.memoryMbytes,

          timeoutSecs:
            options.timeoutSecs,

          dockerImage:
            actor.docker_image,

          proxyGroupId:
            options.proxyGroupId,
        },
      });

      res.status(201).json({
        success: true,

        data: {
          runId: run.id,

          status:
            'queued',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:campaignId/runs/:runId',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const run =
        await RunService.getRunById(
          req.params.runId,
          req.user!.orgId
        );

      if (
        !run ||
        run.actor_id !==
          req.params
            .campaignId
      ) {
        throw new AppError(
          'Run not found',
          404
        );
      }

      res.json({
        success: true,

        data: run,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:campaignId/export',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {
        format = 'excel',
        includeMeta = 'true',
        columns,
        limit = '10000',
        filterApply = 'true',
      } = req.query as any;

      const actorRes =
        await db.query(
          `
SELECT id, name
FROM actors

WHERE
id = $1
AND org_id = $2
`,
          [
            req.params
              .campaignId,

            req.user!.orgId,
          ]
        );

      if (
        !actorRes.rows.length
      ) {
        throw new AppError(
          'Campaign not found',
          404
        );
      }

      const datasetRes =
        await db.query(
          `
SELECT
d.id,
d.item_count,
r.id as run_id,
r.duration_secs,
r.stats,
r.created_at

FROM datasets d

JOIN runs r
ON r.dataset_id = d.id

WHERE
r.actor_id = $1
AND d.org_id = $2

ORDER BY r.created_at DESC

LIMIT 1
`,
          [
            req.params
              .campaignId,

            req.user!.orgId,
          ]
        );

      if (
        !datasetRes.rows.length
      ) {
        throw new AppError(
          'No dataset available for export',
          404
        );
      }

      const dataset =
        datasetRes.rows[0];

      const cappedLimit =
        Math.min(
          parseInt(
            limit,
            10
          ) || 10000,
          100000
        );

      const itemsRes =
        await db.query(
          `
SELECT data

FROM dataset_items

WHERE dataset_id = $1

ORDER BY id ASC

LIMIT $2
`,
          [
            dataset.id,
            cappedLimit,
          ]
        );

      const rows =
        itemsRes.rows.map(
          (row) => row.data
        );

      const selectedColumns =
        columns
          ? String(columns)
              .split(',')
              .map((v) =>
                v.trim()
              )
              .filter(Boolean)
          : undefined;

      const metadata = {
        campaign:
          actorRes.rows[0]
            .name,

        exportedAt:
          new Date().toISOString(),

        totalRecords:
          dataset.item_count,

        durationSeconds:
          dataset.duration_secs,

        runId:
          dataset.run_id,

        successRate:
          dataset.stats
            ?.success_rate ??
          null,

        sourceUrls:
          dataset.stats
            ?.source_urls ??
          [],

        filterApplied:
          filterApply ===
          'true',

        exportedBy:
          req.user!.email,
      };

      const fileNameBase = `${createSlug(
        actorRes.rows[0].name
      )}-${new Date()
        .toISOString()
        .slice(0, 10)}`;

      if (format === 'csv') {
        const buffer =
          ExportService.toCsv(
            rows,
            {
              columns:
                selectedColumns,
            }
          );

        res.set(
          'Content-Type',
          'text/csv'
        );

        res.set(
          'Content-Disposition',
          `attachment; filename="${fileNameBase}.csv"`
        );

        return res.send(
          buffer
        );
      }

      if (
        format === 'json'
      ) {
        const buffer =
          ExportService.toJson(
            rows,
            {
              columns:
                selectedColumns,

              includeMeta:
                includeMeta ===
                'true',

              metadata,
            }
          );

        res.set(
          'Content-Type',
          'application/json'
        );

        res.set(
          'Content-Disposition',
          `attachment; filename="${fileNameBase}.json"`
        );

        return res.send(
          buffer
        );
      }

      const buffer =
        ExportService.toExcel(
          rows,
          {
            columns:
              selectedColumns,

            includeMeta:
              includeMeta ===
              'true',

            metadata,

            fileName:
              fileNameBase,
          }
        );

      res.set(
        'Content-Type',
        'application/vnd.ms-excel'
      );

      res.set(
        'Content-Disposition',
        `attachment; filename="${fileNameBase}.xls"`
      );

      return res.send(
        buffer
      );
    } catch (error) {
      next(error);
    }
  }
);

export default router;