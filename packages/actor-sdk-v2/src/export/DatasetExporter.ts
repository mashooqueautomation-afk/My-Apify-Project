import fs from 'fs';
import path from 'path';

const XLSX = require('xlsx');

export class DatasetExporter {

  /**
   * Export JSON → CSV
   */
  static async exportCSV(
    items: any[],
    outputPath: string
  ): Promise<void> {

    if (!items.length) {
      throw new Error(
        'No dataset items to export'
      );
    }

    const headers =
      Object.keys(items[0]);

    const rows = [
      headers.join(','),
      ...items.map((item) =>
        headers
          .map((h) =>
            JSON.stringify(item[h] ?? '')
          )
          .join(',')
      ),
    ];

    fs.writeFileSync(
      outputPath,
      rows.join('\n')
    );
  }

  /**
   * Export JSON → Excel
   */
  static async exportExcel(
    items: any[],
    outputPath: string
  ): Promise<void> {

    const worksheet =
      XLSX.utils.json_to_sheet(items);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Dataset'
    );

    XLSX.writeFile(
      workbook,
      outputPath
    );
  }

  /**
   * Ensure export directory exists
   */
  static ensureExportDir(
    dir: string
  ): void {

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
      });
    }
  }
}