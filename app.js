const form = document.getElementById('claim-form');
const resultsPanel = document.getElementById('results');
const auditPill = document.getElementById('audit-pill');
const generatedAt = document.getElementById('generatedAt');

const sectionIds = {
  submissionSummary: 'claim-inputs',
  perDocument: 'doc-summary',
  consolidatedFacts: 'extracted-data',
  matchingAnalysis: 'matching-analysis',
  crossDocumentValidation: 'cross-document-validation',
  guidelineComparison: 'guideline-analysis',
  aiScreening: 'ai-screening',
  overallSummary: 'overall-summary'
};

const REFERENCE_INDEX_PATH = 'reference_docs/index.json';
const MAX_TEXT_READ_BYTES = 500_000;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toCurrency(value, currency = 'USD') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Not found';
  return Number(value).toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function normalizeName(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMoney(value) {
  const normalized = String(value || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return normalized ? Number(normalized[0]) : null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function confidenceLabel(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function statusBadge(status) {
  return `<span class="status-badge ${status.replace(/\s+/g, '-')}">${escapeHtml(status)}</span>`;
}

function parseDateCandidates(text) {
  return unique(text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/g) || []).slice(0, 8);
}

function parseInvoiceCandidates(text) {
  const regex = /(?:invoice\s*(?:no|number)?[:\-\s]*)?([A-Z]{1,5}-?\d{3,12})/gi;
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) out.push(match[1].toUpperCase());
  return unique(out).slice(0, 6);
}

function parseReferenceCandidates(text) {
  const regex = /\b(?:req|request|approval|reference|ref|po)[\s:#-]*([A-Z0-9-]{3,18})\b/gi;
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) out.push(`${match[0].replace(/\s+/g, ' ').trim()}`.toUpperCase());
  return unique(out).slice(0, 6);
}

function parseCurrencyCandidates(text) {
  const found = [];
  if (/\bUSD\b|\$/.test(text)) found.push('USD');
  if (/\bEUR\b|€/.test(text)) found.push('EUR');
  if (/\bGBP\b|£/.test(text)) found.push('GBP');
  if (/\bINR\b|₹/.test(text)) found.push('INR');
  return unique(found);
}

function parseAmountLabeled(text) {
  const rows = [];
  const regex = /\b(net|subtotal|vat|tax|total|gross|grand total|amount)\b\s*[:\-]?\s*([$€£₹]?\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const label = match[1].toLowerCase();
    const amount = parseMoney(match[2]);
    if (amount !== null) rows.push({ label, amount });
  }
  return rows;
}

function parsePartnerOrVendor(text) {
  const regex = /\b(partner|vendor|supplier|customer|client)\s*[:\-]\s*([a-z0-9 .,&'-]{3,80})/gi;
  const values = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    values.push(match[2].trim());
  }
  return unique(values).slice(0, 6);
}

function parseActivity(text) {
  const regex = /\b(activity|description|scope|service)\s*[:\-]\s*([a-z0-9 .,&'()-]{8,150})/gi;
  const values = [];
  let match;
  while ((match = regex.exec(text)) !== null) values.push(match[2].trim());
  return unique(values).slice(0, 4);
}

function parseIndicators(text) {
  const indicators = [];
  const map = [
    ['signature', 'Signature indicator'],
    ['signed', 'Signed evidence'],
    ['stamp', 'Stamp indicator'],
    ['acceptance', 'Acceptance indicator'],
    ['delivery', 'Delivery evidence'],
    ['completion', 'Completion evidence'],
    ['timesheet', 'Timesheet evidence'],
    ['photo', 'Photo evidence']
  ];
  map.forEach(([key, label]) => {
    if (text.includes(key)) indicators.push(label);
  });
  return unique(indicators);
}

function guessDocType(file, text) {
  const source = `${file.name.toLowerCase()} ${text.slice(0, 4000)}`;
  if (/invoice|inv[-_\d]/.test(source)) return 'invoice';
  if (/agreement|contract|sponsorship/.test(source)) return 'agreement';
  if (/approval|request|po[-_\d]|reference/.test(source)) return 'approval';
  if (/\.png|\.jpg|\.jpeg/.test(file.name.toLowerCase())) return 'photo';
  if (/receipt|delivery|timesheet|attendance/.test(source)) return 'supporting document';
  return 'unknown';
}

async function readTextSnippet(file) {
  const textReadable = /text|json|csv|xml/.test(file.type) || /\.(txt|csv|json|xml|md)$/i.test(file.name);
  if (!textReadable) return { text: '', readable: false };
  try {
    return { text: (await file.text()).slice(0, MAX_TEXT_READ_BYTES).toLowerCase(), readable: true };
  } catch (_err) {
    return { text: '', readable: false };
  }
}

function computeFinancials(amountRows) {
  const pick = (labels) => amountRows.find((r) => labels.some((l) => r.label.includes(l)))?.amount ?? null;
  const net = pick(['net', 'subtotal']);
  const vat = pick(['vat', 'tax']);
  const gross = pick(['grand total', 'gross', 'total']) ?? (net !== null && vat !== null ? net + vat : null);
  return { net, vat, gross };
}

async function extractPerDocument(files) {
  const docs = [];

  for (const file of files) {
    const { text, readable } = await readTextSnippet(file);
    const invoiceNumbers = parseInvoiceCandidates(text);
    const dates = parseDateCandidates(text);
    const references = parseReferenceCandidates(text);
    const currencies = parseCurrencyCandidates(text);
    const amountRows = parseAmountLabeled(text);
    const names = parsePartnerOrVendor(text);
    const activities = parseActivity(text);
    const indicators = parseIndicators(text);
    const financials = computeFinancials(amountRows);

    const extractedFieldCount = [
      invoiceNumbers.length,
      dates.length,
      references.length,
      currencies.length,
      amountRows.length,
      names.length,
      activities.length,
      indicators.length
    ].filter((count) => count > 0).length;

    const score = readable ? Math.min(1, 0.2 + extractedFieldCount * 0.11) : 0.2;

    docs.push({
      fileName: file.name,
      fileType: file.type || 'unknown',
      fileSize: file.size,
      docType: guessDocType(file, text),
      readable,
      extractionConfidence: confidenceLabel(score),
      note: readable ? '' : 'Unable to extract reliable text from this file; metadata-only checks applied.',
      fields: {
        partnerNames: names,
        vendorNames: names,
        invoiceNumbers,
        dates,
        references,
        currencies,
        amountRows,
        netAmount: financials.net,
        vatAmount: financials.vat,
        grossAmount: financials.gross,
        activity: activities,
        indicators
      }
    });
  }

  return docs;
}

async function loadGuidelineDocs() {
  try {
    const indexResponse = await fetch(REFERENCE_INDEX_PATH);
    if (!indexResponse.ok) return { docs: [], status: 'Unable to load reference guideline index.' };

    const indexData = await indexResponse.json();
    if (!Array.isArray(indexData.documents) || indexData.documents.length === 0) {
      return { docs: [], status: 'No guideline documents configured.' };
    }

    const docs = await Promise.all(
      indexData.documents.map(async (entry) => {
        try {
          const response = await fetch(entry.path);
          if (!response.ok) return { name: entry.name || entry.path, path: entry.path, content: '', loaded: false };
          return {
            name: entry.name || entry.path,
            path: entry.path,
            content: await response.text(),
            loaded: true
          };
        } catch (_error) {
          return { name: entry.name || entry.path, path: entry.path, content: '', loaded: false };
        }
      })
    );

    const loadedCount = docs.filter((d) => d.loaded).length;
    return { docs, status: `Loaded ${loadedCount}/${docs.length} guideline document(s).` };
  } catch (_error) {
    return { docs: [], status: 'Unable to load guideline documents.' };
  }
}

function buildConsolidatedFacts(perDocument, enteredPartner) {
  const factMap = {
    partnerNames: [],
    vendorNames: [],
    invoiceNumbers: [],
    invoiceDates: [],
    references: [],
    netAmount: [],
    vatAmount: [],
    grossAmount: [],
    currencies: [],
    activities: [],
    performanceEvidence: [],
    dates: [],
    signatures: []
  };

  factMap.partnerNames.push({ value: enteredPartner, source: 'Entered by user', confidence: 'high' });

  perDocument.forEach((doc) => {
    const source = doc.fileName;
    const baseConfidence = doc.extractionConfidence;

    doc.fields.partnerNames.forEach((v) => factMap.partnerNames.push({ value: v, source, confidence: baseConfidence }));
    doc.fields.vendorNames.forEach((v) => factMap.vendorNames.push({ value: v, source, confidence: baseConfidence }));
    doc.fields.invoiceNumbers.forEach((v) => factMap.invoiceNumbers.push({ value: v, source, confidence: baseConfidence }));
    doc.fields.dates.forEach((v) => {
      factMap.invoiceDates.push({ value: v, source, confidence: baseConfidence });
      factMap.dates.push({ value: v, source, confidence: baseConfidence });
    });
    doc.fields.references.forEach((v) => factMap.references.push({ value: v, source, confidence: baseConfidence }));
    if (doc.fields.netAmount !== null) factMap.netAmount.push({ value: doc.fields.netAmount, source, confidence: baseConfidence });
    if (doc.fields.vatAmount !== null) factMap.vatAmount.push({ value: doc.fields.vatAmount, source, confidence: baseConfidence });
    if (doc.fields.grossAmount !== null) factMap.grossAmount.push({ value: doc.fields.grossAmount, source, confidence: baseConfidence });
    doc.fields.currencies.forEach((v) => factMap.currencies.push({ value: v, source, confidence: baseConfidence }));
    doc.fields.activity.forEach((v) => factMap.activities.push({ value: v, source, confidence: baseConfidence }));
    doc.fields.indicators.forEach((v) => {
      factMap.performanceEvidence.push({ value: v, source, confidence: baseConfidence });
      if (/signature|stamp|acceptance/i.test(v)) factMap.signatures.push({ value: v, source, confidence: baseConfidence });
    });
  });

  const conflicts = [];
  const conflictFields = [
    ['invoiceNumbers', 'Invoice number'],
    ['grossAmount', 'Gross amount'],
    ['currencies', 'Currency'],
    ['references', 'Approval/request reference'],
    ['invoiceDates', 'Invoice date']
  ];

  conflictFields.forEach(([key, label]) => {
    const distinct = unique(factMap[key].map((row) => String(row.value)));
    if (distinct.length > 1) {
      conflicts.push({ field: label, values: distinct, sources: unique(factMap[key].map((row) => row.source)) });
    }
  });

  return { facts: factMap, conflicts };
}

function compareValues(values) {
  const present = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  const distinct = unique(present.map((v) => String(v).toLowerCase()));
  if (present.length === 0) return 'not enough evidence';
  if (distinct.length === 1) return 'match';
  if (distinct.length <= 3) return 'partial match';
  return 'mismatch';
}

function buildCrossValidation(consolidated) {
  const f = consolidated.facts;

  const checks = [
    {
      name: 'Partner name consistency',
      values: f.partnerNames.map((x) => x.value),
      sources: unique(f.partnerNames.map((x) => x.source)),
      explanationMatch: 'Detected partner names are consistent across entered and extracted evidence.',
      explanationMismatch: 'Multiple partner name variants were found; verify legal entity naming.'
    },
    {
      name: 'Invoice number consistency',
      values: f.invoiceNumbers.map((x) => x.value),
      sources: unique(f.invoiceNumbers.map((x) => x.source)),
      explanationMatch: 'Invoice reference is aligned across available documents.',
      explanationMismatch: 'Invoice references vary across documents.'
    },
    {
      name: 'Date consistency',
      values: f.invoiceDates.map((x) => x.value),
      sources: unique(f.invoiceDates.map((x) => x.source)),
      explanationMatch: 'Dates are aligned in extracted records.',
      explanationMismatch: 'Multiple date values were detected; period validation needed.'
    },
    {
      name: 'Amount consistency',
      values: f.grossAmount.map((x) => x.value),
      sources: unique(f.grossAmount.map((x) => x.source)),
      explanationMatch: 'Gross/total amounts are consistent across documents.',
      explanationMismatch: 'Different total amounts were detected across documents.'
    },
    {
      name: 'Currency consistency',
      values: f.currencies.map((x) => x.value),
      sources: unique(f.currencies.map((x) => x.source)),
      explanationMatch: 'Currency is consistent in extracted content.',
      explanationMismatch: 'Multiple currencies were detected in uploaded materials.'
    },
    {
      name: 'Approval/request number consistency',
      values: f.references.map((x) => x.value),
      sources: unique(f.references.map((x) => x.source)),
      explanationMatch: 'Approval/request references are consistent where present.',
      explanationMismatch: 'Approval/request references are incomplete or conflicting.'
    },
    {
      name: 'Proof-of-performance supports invoice/agreement',
      values: f.performanceEvidence.map((x) => x.value),
      sources: unique(f.performanceEvidence.map((x) => x.source)),
      explanationMatch: 'Performance-related indicators are present in uploaded documents.',
      explanationMismatch: 'Limited or inconsistent proof-of-performance evidence detected.'
    },
    {
      name: 'Agreement scope matches invoice description',
      values: f.activities.map((x) => x.value),
      sources: unique(f.activities.map((x) => x.source)),
      explanationMatch: 'Activity/service descriptions appear consistent in extracted text.',
      explanationMismatch: 'Activity descriptions differ across extracted sources.'
    }
  ];

  return checks.map((check) => {
    const status = compareValues(check.values);
    const explanation = status === 'match' ? check.explanationMatch : status === 'not enough evidence'
      ? 'Unable to verify due to limited extractable evidence.'
      : check.explanationMismatch;

    return {
      ...check,
      status,
      explanation,
      sourceDocs: check.sources.length ? check.sources : ['Not found']
    };
  });
}

function extractGuidelineRequirements(guidelineDocs) {
  const requirements = [];

  guidelineDocs.docs.filter((d) => d.loaded).forEach((doc) => {
    const lines = doc.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 10);

    lines.forEach((line, index) => {
      const sentenceParts = line.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
      sentenceParts.forEach((sentence, partIndex) => {
        const key = sentence.toLowerCase();
        const isRequirement = /(must|should|required|include|verify|present|support|consisten|check|review)/i.test(sentence);
        if (!isRequirement) return;

        requirements.push({
          id: `${doc.name}-${index}-${partIndex}`,
          title: sentence.slice(0, 70),
          description: sentence,
          keywords: unique((key.match(/[a-z]{4,}/g) || []).slice(0, 12)),
          sourceGuideline: doc.name
        });
      });
    });
  });

  return requirements;
}

function evaluateRequirement(requirement, consolidated, perDocument) {
  const corpus = JSON.stringify(consolidated.facts).toLowerCase();
  const keywordHits = requirement.keywords.filter((k) => corpus.includes(k));
  const ratio = requirement.keywords.length ? keywordHits.length / requirement.keywords.length : 0;

  let status = 'unable to verify';
  if (ratio >= 0.45) status = 'satisfied';
  else if (ratio >= 0.2) status = 'partially satisfied';
  else if (keywordHits.length > 0) status = 'partially satisfied';
  else if (requirement.keywords.length > 0) status = 'missing';

  const evidenceDocs = perDocument
    .filter((doc) => requirement.keywords.some((kw) => JSON.stringify(doc.fields).toLowerCase().includes(kw)))
    .map((doc) => doc.fileName);

  return {
    requirementTitle: requirement.title,
    requirementDescription: requirement.description,
    status,
    evidence: evidenceDocs.length ? evidenceDocs.join(', ') : 'Not found',
    sourceGuideline: requirement.sourceGuideline,
    reviewerNote:
      status === 'satisfied'
        ? 'Requirement evidence is present in extracted content.'
        : status === 'partially satisfied'
          ? 'Some evidence found; manual verification recommended.'
          : status === 'missing'
            ? 'No supporting extracted evidence found.'
            : 'Unable to verify from extracted content.'
  };
}

function renderSubmissionSummary(partnerName, claimedAmount, files) {
  return `
    <h3>Submission Summary</h3>
    <ul>
      <li><strong>Partner Name entered:</strong> ${escapeHtml(partnerName)}</li>
      <li><strong>Claimed Amount entered:</strong> ${toCurrency(claimedAmount)}</li>
      <li><strong>Total uploaded files:</strong> ${files.length}</li>
    </ul>
    <table class="data-table">
      <thead><tr><th>Filename</th><th>Type</th><th>Size</th></tr></thead>
      <tbody>
        ${files
          .map((f) => `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.type || 'unknown')}</td><td>${formatFileSize(f.size)}</td></tr>`)
          .join('')}
      </tbody>
    </table>
  `;
}

function renderPerDocumentSummary(perDocument) {
  return `
    <h3>Per-Document Extraction Summary</h3>
    ${perDocument
      .map((doc) => {
        const keys = [
          ['Partner/Vendor', doc.fields.partnerNames.join(', ') || 'Not found'],
          ['Invoice Number', doc.fields.invoiceNumbers.join(', ') || 'Not found'],
          ['Dates', doc.fields.dates.join(', ') || 'Not found'],
          ['Approval/Request/Reference', doc.fields.references.join(', ') || 'Not found'],
          ['Net/VAT/Gross', `${toCurrency(doc.fields.netAmount)} / ${toCurrency(doc.fields.vatAmount)} / ${toCurrency(doc.fields.grossAmount)}`],
          ['Currency', doc.fields.currencies.join(', ') || 'Not found'],
          ['Activity/Service', doc.fields.activity.join(' | ') || 'Not found'],
          ['Signatures/Stamps/Acceptance', doc.fields.indicators.filter((x) => /signature|stamp|acceptance/i.test(x)).join(', ') || 'Not found']
        ];

        return `
          <div class="sub-card">
            <p><strong>Document:</strong> ${escapeHtml(doc.fileName)}</p>
            <p><strong>Document type guess:</strong> ${escapeHtml(doc.docType)}</p>
            <p><strong>Extraction confidence:</strong> <span class="confidence ${doc.extractionConfidence}">${doc.extractionConfidence}</span></p>
            ${doc.note ? `<p><strong>Extraction note:</strong> ${escapeHtml(doc.note)}</p>` : ''}
            <table class="data-table compact">
              <tbody>
                ${keys.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        `;
      })
      .join('')}
  `;
}

function renderFactsTable(rows, formatter = (v) => v) {
  if (!rows.length) return '<p class="empty">Not found</p>';
  return `
    <table class="data-table compact">
      <thead><tr><th>Value</th><th>Source document</th><th>Confidence</th></tr></thead>
      <tbody>
        ${rows
          .map((row) => `<tr><td>${escapeHtml(formatter(row.value))}</td><td>${escapeHtml(row.source)}</td><td><span class="confidence ${row.confidence}">${row.confidence}</span></td></tr>`)
          .join('')}
      </tbody>
    </table>
  `;
}

function renderConsolidatedFacts(consolidated) {
  const f = consolidated.facts;

  return `
    <h3>Consolidated Extracted Facts</h3>
    <div class="fact-section"><h4>Partner / vendor names detected</h4>${renderFactsTable([...f.partnerNames, ...f.vendorNames])}</div>
    <div class="fact-section"><h4>Invoice number(s)</h4>${renderFactsTable(f.invoiceNumbers)}</div>
    <div class="fact-section"><h4>Invoice date(s)</h4>${renderFactsTable(f.invoiceDates)}</div>
    <div class="fact-section"><h4>Approval/request/reference number(s)</h4>${renderFactsTable(f.references)}</div>
    <div class="fact-section"><h4>Net amount</h4>${renderFactsTable(f.netAmount, (v) => toCurrency(v))}</div>
    <div class="fact-section"><h4>VAT amount</h4>${renderFactsTable(f.vatAmount, (v) => toCurrency(v))}</div>
    <div class="fact-section"><h4>Gross/total amount</h4>${renderFactsTable(f.grossAmount, (v) => toCurrency(v))}</div>
    <div class="fact-section"><h4>Currency</h4>${renderFactsTable(f.currencies)}</div>
    <div class="fact-section"><h4>Activity / service description</h4>${renderFactsTable(f.activities)}</div>
    <div class="fact-section"><h4>Proof-of-performance evidence</h4>${renderFactsTable(f.performanceEvidence)}</div>
    <div class="fact-section"><h4>Dates detected</h4>${renderFactsTable(f.dates)}</div>
    <div class="fact-section"><h4>Signatures / stamp / acceptance indicators</h4>${renderFactsTable(f.signatures)}</div>

    <h4>Conflicting extracted values</h4>
    ${consolidated.conflicts.length ? `
      <table class="data-table compact">
        <thead><tr><th>Field</th><th>Conflicting values</th><th>Source document(s)</th></tr></thead>
        <tbody>
          ${consolidated.conflicts
            .map((c) => `<tr><td>${escapeHtml(c.field)}</td><td>${escapeHtml(c.values.join(' | '))}</td><td>${escapeHtml(c.sources.join(', '))}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    ` : '<p class="empty">No conflicting values found.</p>'}
  `;
}

function renderMatchingAnalysis(consolidated, claimedAmount) {
  const gross = consolidated.facts.grossAmount.map((x) => x.value);
  const primaryGross = gross.length ? Number(gross[0]) : null;
  const diff = primaryGross === null ? null : claimedAmount - primaryGross;

  return `
    <h3>Matching Analysis</h3>
    <table class="data-table compact">
      <tbody>
        <tr><th>Claimed amount entered</th><td>${toCurrency(claimedAmount)}</td></tr>
        <tr><th>Invoice net amount</th><td>${toCurrency(consolidated.facts.netAmount[0]?.value)}</td></tr>
        <tr><th>Invoice VAT amount</th><td>${toCurrency(consolidated.facts.vatAmount[0]?.value)}</td></tr>
        <tr><th>Invoice gross/total amount</th><td>${toCurrency(primaryGross)}</td></tr>
        <tr><th>Difference vs claimed amount</th><td>${diff === null ? 'Unable to extract' : toCurrency(diff)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderCrossValidation(checks) {
  return `
    <h3>Cross-Document Validation Analysis</h3>
    <table class="data-table">
      <thead><tr><th>Check</th><th>Status</th><th>Explanation</th><th>Source documents used</th></tr></thead>
      <tbody>
        ${checks
          .map(
            (check) => `<tr>
              <td>${escapeHtml(check.name)}</td>
              <td>${statusBadge(check.status)}</td>
              <td>${escapeHtml(check.explanation)}</td>
              <td>${escapeHtml(check.sourceDocs.join(', '))}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderGuidelineComparison(requirementResults, guidelineStatus) {
  const stats = {
    total: requirementResults.length,
    satisfied: requirementResults.filter((r) => r.status === 'satisfied').length,
    partial: requirementResults.filter((r) => r.status === 'partially satisfied').length,
    missing: requirementResults.filter((r) => r.status === 'missing').length,
    unable: requirementResults.filter((r) => r.status === 'unable to verify').length
  };

  return `
    <h3>Comparison Against Source Guideline Documents</h3>
    <p>${escapeHtml(guidelineStatus)}</p>
    <table class="data-table">
      <thead>
        <tr>
          <th>Requirement title</th>
          <th>Requirement description</th>
          <th>Status</th>
          <th>Evidence from uploaded documents</th>
          <th>Source guideline reference</th>
          <th>Reviewer note</th>
        </tr>
      </thead>
      <tbody>
        ${requirementResults
          .map(
            (r) => `<tr>
              <td>${escapeHtml(r.requirementTitle)}</td>
              <td>${escapeHtml(r.requirementDescription)}</td>
              <td>${statusBadge(r.status)}</td>
              <td>${escapeHtml(r.evidence)}</td>
              <td>${escapeHtml(r.sourceGuideline)}</td>
              <td>${escapeHtml(r.reviewerNote)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div class="stats-grid">
      <div><strong>Total requirements checked</strong><br/>${stats.total}</div>
      <div><strong>Satisfied count</strong><br/>${stats.satisfied}</div>
      <div><strong>Partially satisfied count</strong><br/>${stats.partial}</div>
      <div><strong>Missing count</strong><br/>${stats.missing}</div>
      <div><strong>Unable to verify count</strong><br/>${stats.unable}</div>
    </div>
  `;
}

function buildAiFindings(perDocument, consolidated) {
  const findings = [];

  perDocument.forEach((doc) => {
    if (!doc.readable) {
      findings.push({ severity: 'medium', message: 'Text extraction quality is limited; only metadata-based checks applied.', source: doc.fileName });
    }
    if (/edited|scan|copy/i.test(doc.fileName)) {
      findings.push({ severity: 'medium', message: 'Filename suggests edited/scanned artifact; validate against original source if available.', source: doc.fileName });
    }
    if (doc.fields.currencies.length > 1) {
      findings.push({ severity: 'high', message: `Multiple currencies detected (${doc.fields.currencies.join(', ')}).`, source: doc.fileName });
    }
  });

  const invoiceValues = consolidated.facts.invoiceNumbers.map((x) => x.value);
  const duplicates = invoiceValues.filter((v, idx) => invoiceValues.indexOf(v) !== idx);
  unique(duplicates).forEach((dup) => {
    const docs = consolidated.facts.invoiceNumbers.filter((x) => x.value === dup).map((x) => x.source);
    findings.push({ severity: 'high', message: `Duplicate invoice number detected: ${dup}.`, source: docs.join(', ') });
  });

  if (!findings.length) {
    findings.push({ severity: 'low', message: 'No major advisory anomalies detected from current heuristic checks.', source: 'All uploaded documents' });
  }

  return findings;
}

function renderAiScreening(findings) {
  const groups = {
    high: findings.filter((f) => f.severity === 'high'),
    medium: findings.filter((f) => f.severity === 'medium'),
    low: findings.filter((f) => f.severity === 'low')
  };

  const renderGroup = (label, rows) => `
    <h4>${label}</h4>
    ${rows.length ? `<ul>${rows.map((r) => `<li>${statusBadge(r.severity)} ${escapeHtml(r.message)} <br/><span class="trace">Source: ${escapeHtml(r.source)}</span></li>`).join('')}</ul>` : '<p class="empty">Not found</p>'}
  `;

  return `
    <h3>AI Screening (Advisory Only)</h3>
    ${renderGroup('High severity', groups.high)}
    ${renderGroup('Medium severity', groups.medium)}
    ${renderGroup('Low severity', groups.low)}
    <p class="disclaimer">
      Disclaimer: AI Screening is advisory only. It highlights potential anomalies for manual review and does not conclude fraud or forgery.
    </p>
  `;
}

function renderFinalSummary(consolidated, checks, requirementResults) {
  const strongFacts = [];
  if (consolidated.facts.invoiceNumbers.length) strongFacts.push(`Invoice references detected: ${unique(consolidated.facts.invoiceNumbers.map((x) => x.value)).join(', ')}`);
  if (consolidated.facts.grossAmount.length) strongFacts.push(`Gross amount evidence found in ${unique(consolidated.facts.grossAmount.map((x) => x.source)).join(', ')}`);
  if (consolidated.facts.references.length) strongFacts.push('Approval/request references were extracted.');

  const mismatches = checks.filter((c) => c.status === 'mismatch').map((c) => c.name);
  const partials = checks.filter((c) => c.status === 'partial match').map((c) => c.name);
  const missingReq = requirementResults.filter((r) => r.status === 'missing').map((r) => r.requirementTitle);

  return `
    <h3>Final Analytical Summary</h3>
    <ul>
      <li><strong>Strongest supported facts:</strong> ${strongFacts.length ? escapeHtml(strongFacts.join(' | ')) : 'Unable to extract strong corroborated facts.'}</li>
      <li><strong>Biggest inconsistencies:</strong> ${mismatches.length ? escapeHtml(mismatches.join(', ')) : 'No direct mismatches detected; check partial matches.'}</li>
      <li><strong>Biggest missing items:</strong> ${missingReq.length ? escapeHtml(missingReq.slice(0, 5).join(', ')) : 'No major missing guideline item detected from extracted content.'}</li>
      <li><strong>Requires manual review:</strong> ${escapeHtml((partials.length ? partials.join(', ') : 'Date/amount/source corroboration') + '.')}</li>
    </ul>
  `;
}

function renderResults({ partnerName, claimedAmount, files, perDocument, consolidated, checks, guidelineResult, aiFindings }) {
  document.getElementById(sectionIds.submissionSummary).innerHTML = renderSubmissionSummary(partnerName, claimedAmount, files);
  document.getElementById(sectionIds.perDocument).innerHTML = renderPerDocumentSummary(perDocument);
  document.getElementById(sectionIds.consolidatedFacts).innerHTML = renderConsolidatedFacts(consolidated);
  document.getElementById(sectionIds.matchingAnalysis).innerHTML = renderMatchingAnalysis(consolidated, claimedAmount);
  document.getElementById(sectionIds.crossDocumentValidation).innerHTML = renderCrossValidation(checks);
  document.getElementById(sectionIds.guidelineComparison).innerHTML = renderGuidelineComparison(guidelineResult.requirements, guidelineResult.status);
  document.getElementById(sectionIds.aiScreening).innerHTML = renderAiScreening(aiFindings);
  document.getElementById(sectionIds.overallSummary).innerHTML = renderFinalSummary(consolidated, checks, guidelineResult.requirements);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const partnerName = document.getElementById('partnerName').value.trim();
  const claimedAmount = Number(document.getElementById('claimedAmount').value);
  const files = Array.from(document.getElementById('documents').files);

  if (!partnerName || Number.isNaN(claimedAmount) || claimedAmount < 0 || files.length === 0) {
    auditPill.textContent = 'Missing or invalid required fields';
    return;
  }

  auditPill.textContent = 'Running analysis...';

  const [perDocument, guidelineDocs] = await Promise.all([extractPerDocument(files), loadGuidelineDocs()]);
  const consolidated = buildConsolidatedFacts(perDocument, partnerName);
  const checks = buildCrossValidation(consolidated);

  const requirements = extractGuidelineRequirements(guidelineDocs);
  const evaluatedRequirements = requirements.length
    ? requirements.map((req) => evaluateRequirement(req, consolidated, perDocument))
    : [{
      requirementTitle: 'Guideline requirements',
      requirementDescription: 'Guideline content could not be parsed into requirements.',
      status: 'unable to verify',
      evidence: 'Not found',
      sourceGuideline: 'Configured guideline documents',
      reviewerNote: 'Guideline comparison limited by extraction quality.'
    }];

  const guidelineResult = {
    requirements: evaluatedRequirements,
    status: guidelineDocs.status
  };

  const aiFindings = buildAiFindings(perDocument, consolidated);

  renderResults({
    partnerName,
    claimedAmount,
    files,
    perDocument,
    consolidated,
    checks,
    guidelineResult,
    aiFindings
  });

  generatedAt.textContent = `Generated on ${new Date().toLocaleString()}`;
  auditPill.textContent = 'Analysis complete';
  resultsPanel.hidden = false;
});
