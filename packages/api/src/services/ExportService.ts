export interface ExportOptions {
  columns?: string[];
  includeMeta?: boolean;
  metadata?: Record<string, unknown>;
  fileName?: string;
}

type Row = Record<string, unknown>;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function pickColumns(rows: Row[], columns?: string[]) {
  if (columns?.length) return columns;

  const seen = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => seen.add(key));
  }
  return Array.from(seen);
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-][0-2]\d:\d{2})?)?$/.test(value);
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function inferCellType(value: unknown): { type: 'String' | 'Number' | 'DateTime'; style: string; value: string } {
  if (value === null || value === undefined) {
    return { type: 'String', style: 'DataText', value: '' };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { type: 'Number', style: 'NumberCell', value: String(value) };
  }

  if (typeof value === 'boolean') {
    return { type: 'String', style: 'DataText', value: value ? 'Yes' : 'No' };
  }

  const text = normalizeCell(value);

  if (typeof value === 'string' && isIsoDate(text)) {
    const iso = new Date(text).toISOString();
    return { type: 'DateTime', style: 'DateCell', value: iso };
  }

  if (typeof value === 'string' && isUrl(text)) {
    return { type: 'String', style: 'HyperlinkCell', value: text };
  }

  const numeric = Number(text);
  if (text !== '' && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(text)) {
    return { type: 'Number', style: 'NumberCell', value: text };
  }

  return { type: 'String', style: 'DataText', value: text };
}

function buildColumnWidths(columns: string[], rows: Row[]) {
  return columns.map((column) => {
    const longestValue = rows.reduce((max, row) => {
      const length = normalizeCell(row[column]).slice(0, 50).length;
      return Math.max(max, length);
    }, column.length);

    return Math.min(Math.max(longestValue + 2, 14), 50) * 7;
  });
}

function metadataRows(metadata: Record<string, unknown>) {
  return Object.entries(metadata).map(([key, value]) => {
    const normalized = Array.isArray(value) ? value.join(', ') : normalizeCell(value);
    return `
      <Row>
        <Cell ss:StyleID="MetaKey"><Data ss:Type="String">${escapeXml(toTitleCase(key))}</Data></Cell>
        <Cell ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(normalized)}</Data></Cell>
      </Row>`;
  }).join('');
}

function dataRows(rows: Row[], columns: string[]) {
  return rows.map((row, index) => {
    const cells = columns.map((column) => {
      const inferred = inferCellType(row[column]);
      const baseCell = `<Cell ss:StyleID="${inferred.style}"><Data ss:Type="${inferred.type}">${escapeXml(inferred.value)}</Data></Cell>`;
      if (inferred.style === 'HyperlinkCell') {
        return `<Cell ss:StyleID="HyperlinkCell" ss:HRef="${escapeXml(inferred.value)}"><Data ss:Type="String">${escapeXml(inferred.value)}</Data></Cell>`;
      }

      if (typeof row[column] === 'number' && column.toLowerCase().includes('rating')) {
        const numeric = Number(row[column]);
        const ratingStyle = numeric >= 4 ? 'RatingHigh' : numeric >= 3 ? 'RatingMedium' : 'RatingLow';
        return `<Cell ss:StyleID="${ratingStyle}"><Data ss:Type="Number">${row[column]}</Data></Cell>`;
      }

      return baseCell;
    }).join('');

    return `<Row ss:StyleID="${index % 2 === 0 ? 'RowEven' : 'RowOdd'}">${cells}</Row>`;
  }).join('');
}

export class ExportService {
  static validateData(rows: Row[]): Row[] {
    return rows.map((row) =>
      Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, value ?? '']))
    );
  }

  static toCsv(rows: Row[], options: ExportOptions = {}): Buffer {
    const safeRows = this.validateData(rows);
    const columns = pickColumns(safeRows, options.columns);
    const csv = [
      columns.map((column) => this.escapeCsv(column)).join(','),
      ...safeRows.map((row) => columns.map((column) => this.escapeCsv(row[column])).join(',')),
    ].join('\n');

    return Buffer.from(csv, 'utf8');
  }

  static toJson(rows: Row[], options: ExportOptions = {}): Buffer {
    const safeRows = this.validateData(rows);
    const columns = pickColumns(safeRows, options.columns);
    const shapedRows = safeRows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ''])));
    const payload = options.includeMeta
      ? { meta: options.metadata || {}, data: shapedRows }
      : shapedRows;

    return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  }

  static toExcel(rows: Row[], options: ExportOptions = {}): Buffer {
    const safeRows = this.validateData(rows);
    const columns = pickColumns(safeRows, options.columns);
    const widths = buildColumnWidths(columns, safeRows);
    const meta = options.metadata || {};

    const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Inter" ss:Size="10" ss:Color="#E2E8F0"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Inter" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#00D4FF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      </Borders>
    </Style>
    <Style ss:ID="MetaKey">
      <Font ss:FontName="Inter" ss:Size="10" ss:Bold="1" ss:Color="#E2E8F0"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="MetaValue">
      <Font ss:FontName="Inter" ss:Size="10" ss:Color="#CBD5E1"/>
      <Interior ss:Color="#111827" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="DataText">
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="RowEven">
      <Interior ss:Color="#111827" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="RowOdd">
      <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="NumberCell">
      <Alignment ss:Horizontal="Right"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00"/>
    </Style>
    <Style ss:ID="DateCell">
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="yyyy-mm-dd hh:mm:ss"/>
    </Style>
    <Style ss:ID="HyperlinkCell">
      <Font ss:FontName="Inter" ss:Size="10" ss:Color="#38BDF8" ss:Underline="Single"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="RatingHigh">
      <Alignment ss:Horizontal="Right"/>
      <Font ss:Color="#22C55E" ss:Bold="1"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00"/>
    </Style>
    <Style ss:ID="RatingMedium">
      <Alignment ss:Horizontal="Right"/>
      <Font ss:Color="#FACC15" ss:Bold="1"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00"/>
    </Style>
    <Style ss:ID="RatingLow">
      <Alignment ss:Horizontal="Right"/>
      <Font ss:Color="#F87171" ss:Bold="1"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="0.00"/>
    </Style>
  </Styles>
  ${options.includeMeta ? `
  <Worksheet ss:Name="Metadata">
    <Table>
      <Column ss:Width="180"/>
      <Column ss:Width="320"/>
      ${metadataRows(meta)}
    </Table>
  </Worksheet>` : ''}
  <Worksheet ss:Name="Data">
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
    </WorksheetOptions>
    <Table>
      ${widths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join('')}
      <Row>
        ${columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(toTitleCase(column))}</Data></Cell>`).join('')}
      </Row>
      ${dataRows(safeRows, columns)}
    </Table>
  </Worksheet>
</Workbook>`;

    return Buffer.from(workbook, 'utf8');
  }

  private static escapeCsv(value: unknown): string {
    const text = normalizeCell(value).replace(/"/g, '""');
    return /[,"\n]/.test(text) ? `"${text}"` : text;
  }
}
