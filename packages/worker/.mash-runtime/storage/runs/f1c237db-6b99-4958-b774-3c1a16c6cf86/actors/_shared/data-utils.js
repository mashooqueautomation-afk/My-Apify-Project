function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function cleanUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(String(value), baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizePrice(value, currencyHint = null) {
  if (!value) return { amount: null, currency: currencyHint };
  const text = cleanText(value);
  const amount = cleanNumber(text);
  const currency = currencyHint
    || (text.includes('$') ? 'USD' : null)
    || (text.includes('£') ? 'GBP' : null)
    || (text.includes('€') ? 'EUR' : null)
    || (text.includes('PKR') ? 'PKR' : null);
  return { amount, currency };
}

function dedupeRecords(records, fields = ['url', 'sku', 'headline', 'name']) {
  const seen = new Set();
  return records.filter((record) => {
    const key = fields.map((field) => record?.[field] || '').join('|');
    if (!key.replace(/\|/g, '')) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withMetadata(record, metadata = {}) {
  return {
    ...record,
    scrapedAt: metadata.scrapedAt || new Date().toISOString(),
    sourceUrl: metadata.sourceUrl || record.sourceUrl || null,
    sourceType: metadata.sourceType || null,
  };
}

async function saveOutput({ Actor, dataset, kvs, records, outputKey = 'OUTPUT', meta = {} }) {
  const deduped = dedupeRecords(records);
  Actor.log.info(`[Output] Preparing to save ${deduped.length} deduped records`);
  if (deduped.length) {
    await dataset.pushData(deduped);
  }

  Actor.log.info('[Output] Fetching dataset info');
  const datasetInfo = await dataset.getInfo().catch(() => ({}));
  const payload = {
    count: deduped.length,
    datasetId: datasetInfo.id || null,
    itemCount: datasetInfo.itemCount || deduped.length,
    generatedAt: new Date().toISOString(),
    ...meta,
  };

  Actor.log.info('[Output] Saving summary to key-value store');
  await kvs.setValue(outputKey, payload);
  Actor.log.info('[Output] Updating status message');
  await Actor.setStatusMessage(`Saved ${deduped.length} records`);
  Actor.log.info('[Output] Save completed');
  return payload;
}

module.exports = {
  cleanNumber,
  cleanText,
  cleanUrl,
  dedupeRecords,
  normalizePrice,
  saveOutput,
  withMetadata,
};
