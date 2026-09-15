#!/usr/bin/env node
'use strict';

// Coordinate calibration harness for Zoho Sign (design §7.4).
//
// Zoho publishes x_coord / y_coord / abs_width / abs_height as bare numbers and never says what
// unit they are in, where the origin sits, or what page size they are relative to. That answer
// cannot be read out of the documentation; it has to be measured against a real account. This
// script is how it gets measured.
//
// TWO HARD RULES, both deliberate:
//
//   1. IT NEVER TOUCHES MONGODB. The MONGODB_URI in .env IS the live production database — there
//      is no dev database. Every value below is hardcoded fixture data. The script does not
//      require the mongodb driver, and it deletes MONGODB_URI from its own process environment
//      before doing anything, so nothing it loads later can reach for it either.
//
//   2. IT IS RUN BY A HUMAN, EXPLICITLY. It is not wired into npm test, any hook or any CI job.
//      A real send emails a real person and, if `testing=true` is not honoured, spends one of
//      the account's 10 trial documents. That is why --send needs a second confirming flag.
//
// SUBMIT PAYLOAD SHAPE IS SETTLED (verified live 2026-09-14, request_id …046007). Each submit
// action carries action_id plus the full writable attribute set (action_type, recipient_name,
// recipient_email, signing_order, verify_recipient); fields carry no field_category and send
// abs_width/abs_height as numbers. Zoho's 9039 names nothing, 9043 names the key in
// error_param — so when a submit is refused, send a superset and let 9043 name what to strip.
// What is STILL OPEN is only the coordinate origin and unit, which is what this script is for.
//
// The account budget is why this puts FIVE probe fields on ONE page: one send has to answer
// origin (top or bottom), unit (pt, px or something else) and reference page size at once.
//
// Usage:
//   node scripts/zoho-calibrate.cjs                          dry run; builds and prints everything, no network
//   node scripts/zoho-calibrate.cjs --check                  live, read-only; proves auth + DC. Costs no document.
//   node scripts/zoho-calibrate.cjs --send --email=you@x.com --confirm-one-document
//
// Flags:
//   --email=<address>   the single recipient. Required for --send. Use your own address.
//   --origin=top|bottom overrides ZOHO_SIGN_COORD_ORIGIN for this run
//   --unit=pt|px        overrides ZOHO_SIGN_COORD_UNIT for this run
//   --no-testing        send WITHOUT testing=true. Only after you have confirmed testing is not
//                       honoured and you have decided to spend a real trial document.
//   --out=<path>        where to write the fixture PDF (default scripts/zoho-calibration-fixture.pdf)

const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

// Rule 1, enforced rather than promised. Nothing downstream can find the production database.
delete process.env.MONGODB_URI;
delete process.env.POSTGRES_URI;

const axios = require('axios');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const { resolveZohoSignConfig, zohoSignConfigReport } = require('../zoho-sign-config.cjs');
const { createZohoSignAuth } = require('../zoho-sign-auth.cjs');
const { createZohoSignClient, createRedactor } = require('../zoho-sign-client.cjs');
const {
  mapRecipientsToZohoActions,
  mapSignatureFieldsToZoho,
  buildCreateRequestPayload,
  buildSubmitPayload,
} = require('../zoho-sign-mapper.cjs');

// US Letter in points, which is what every CPQ agreement template uses.
const PAGE = Object.freeze({ width: 612, height: 792 });
const PROBE_WIDTH_NORM = 0.25;
const PROBE_HEIGHT_NORM = 0.05;

/**
 * Five probes, chosen so one document answers three questions at once.
 *
 * The corners separate origin from unit: with a top origin P1 lands top-left, with a bottom
 * origin it lands bottom-left — unmistakable. And if Zoho wants CSS pixels while we send points,
 * every box lands at 75% of its asked-for distance from the origin, which the corner probes make
 * obvious in a way a single centred probe never could.
 */
const PROBES = Object.freeze([
  { id: 'P1', label: 'TOP-LEFT', xNorm: 0.05, yNorm: 0.05 },
  { id: 'P2', label: 'TOP-RIGHT', xNorm: 0.70, yNorm: 0.05 },
  { id: 'P3', label: 'CENTRE', xNorm: 0.375, yNorm: 0.475 },
  { id: 'P4', label: 'BOTTOM-LEFT', xNorm: 0.05, yNorm: 0.90 },
  { id: 'P5', label: 'BOTTOM-RIGHT', xNorm: 0.70, yNorm: 0.90 },
]);

const OUT_DEFAULT = path.join(__dirname, 'zoho-calibration-fixture.pdf');

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} };
  argv.slice(2).forEach((raw) => {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (value === undefined) args.flags.add(key);
    else args.values[key] = value;
  });
  return args;
}

function out(line) {
  process.stdout.write(`${line}\n`);
}

function heading(title) {
  out('');
  out(`── ${title} ${'─'.repeat(Math.max(0, 72 - title.length))}`);
}

/**
 * The fixture PDF, generated rather than borrowed: it is NOT a customer document, and every
 * probe rectangle is drawn on the page exactly where it was asked for. Comparing "where Zoho
 * put the box" against "where the red outline is" is then a glance, not a measurement exercise.
 */
async function buildFixturePdf(probes) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('CPQ · Zoho Sign coordinate calibration fixture');
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const toPdfY = (topY) => PAGE.height - topY;

  page.drawText('Zoho Sign coordinate calibration — CPQ12', {
    x: 150, y: toPdfY(30), size: 14, font: bold, color: rgb(0, 0, 0),
  });
  page.drawText(`Page is US Letter: ${PAGE.width} x ${PAGE.height} pt. Red outlines are where CPQ ASKED for each field.`, {
    x: 90, y: toPdfY(48), size: 9, font, color: rgb(0.25, 0.25, 0.25),
  });

  // Rulers along the top and left edges, labelled in points and in normalized fraction, so the
  // measurement can be read straight off the page in whichever unit Zoho turns out to use.
  for (let fraction = 0; fraction <= 1.0001; fraction += 0.1) {
    const x = fraction * PAGE.width;
    const y = fraction * PAGE.height;
    page.drawLine({
      start: { x, y: toPdfY(0) }, end: { x, y: toPdfY(12) }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
    });
    page.drawText(`${fraction.toFixed(1)}/${Math.round(x)}pt`, {
      x: Math.min(x + 2, PAGE.width - 42), y: toPdfY(22), size: 6, font, color: rgb(0.45, 0.45, 0.45),
    });
    page.drawLine({
      start: { x: 0, y: toPdfY(y) }, end: { x: 12, y: toPdfY(y) }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
    });
    page.drawText(`${fraction.toFixed(1)}/${Math.round(y)}pt`, {
      x: 14, y: toPdfY(y) - 2, size: 6, font, color: rgb(0.45, 0.45, 0.45),
    });
  }

  probes.forEach((probe) => {
    const x = probe.xNorm * PAGE.width;
    const topY = probe.yNorm * PAGE.height;
    const width = PROBE_WIDTH_NORM * PAGE.width;
    const height = PROBE_HEIGHT_NORM * PAGE.height;
    page.drawRectangle({
      x, y: toPdfY(topY) - height, width, height,
      borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 1, opacity: 0,
    });
    page.drawText(`${probe.id} ${probe.label}`, {
      x: x + 3, y: toPdfY(topY) - 12, size: 8, font: bold, color: rgb(0.86, 0.15, 0.15),
    });
    page.drawText(`asked norm (${probe.xNorm}, ${probe.yNorm}) = (${Math.round(x)}, ${Math.round(topY)}) pt from TOP-LEFT`, {
      x: x + 3, y: toPdfY(topY) - 24, size: 6, font, color: rgb(0.5, 0.1, 0.1),
    });
  });

  page.drawText('If a Zoho field sits on its red outline, the origin/unit in .env are correct.', {
    x: 60, y: toPdfY(PAGE.height - 30), size: 9, font: bold, color: rgb(0, 0.35, 0),
  });

  return Buffer.from(await pdf.save());
}

/** Hardcoded fixture rows in the exact shape the real collections hold. No database is read. */
function fixtureRecipient(email) {
  return {
    _id: '000000000000000000000001',
    name: 'Calibration Probe',
    email,
    order: 0,
    action: 'signer',
  };
}

function fixtureFields() {
  return PROBES.map((probe, index) => ({
    _id: `probe-${index}`,
    document_id: '000000000000000000000002',
    recipient_id: '000000000000000000000001',
    page: 1,
    type: 'signature',
    xNorm: probe.xNorm,
    yNorm: probe.yNorm,
    widthNorm: PROBE_WIDTH_NORM,
    heightNorm: PROBE_HEIGHT_NORM,
  }));
}

async function httpRequest(spec) {
  const wantsBuffer = spec.responseType === 'buffer';
  const response = await axios({
    method: spec.method,
    url: spec.url,
    headers: spec.headers || {},
    data: spec.body,
    responseType: wantsBuffer ? 'arraybuffer' : 'text',
    transformResponse: [(data) => data],
    validateStatus: () => true,
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return {
    status: response.status,
    headers: response.headers || {},
    body: wantsBuffer ? Buffer.from(response.data) : String(response.data == null ? '' : response.data),
  };
}

/** Anything that looks like a test-mode acknowledgement, wherever Zoho chose to put it. */
function findTestingSignals(value, prefix, found) {
  const hits = found || [];
  if (value == null || typeof value !== 'object') return hits;
  Object.entries(value).forEach(([key, child]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    if (/test|demo|sandbox|watermark|trial|credit/i.test(key)) hits.push(`${label} = ${JSON.stringify(child)}`);
    if (child && typeof child === 'object') findTestingSignals(child, label, hits);
  });
  return hits;
}

async function main() {
  const args = parseArgs(process.argv);
  const wantsSend = args.flags.has('send');
  const wantsCheck = args.flags.has('check');
  const useTesting = !args.flags.has('no-testing');
  const outPath = args.values.out || OUT_DEFAULT;

  const config = resolveZohoSignConfig(Object.assign({}, process.env, {
    ...(args.values.origin ? { ZOHO_SIGN_COORD_ORIGIN: args.values.origin } : {}),
    ...(args.values.unit ? { ZOHO_SIGN_COORD_UNIT: args.values.unit } : {}),
    // The calibration harness talks to Zoho regardless of whether the app feature is switched
    // on — they are separate decisions, and forcing a .env edit to calibrate invites mistakes.
    ZOHO_SIGN_ENABLED: '1',
  }));
  const redact = createRedactor([config.clientSecret, config.refreshToken, config.webhookSecret]);

  heading('Configuration');
  out(JSON.stringify(zohoSignConfigReport(config), null, 2));
  out('MONGODB_URI was removed from this process. Nothing here reads or writes any database.');

  if (config.missingKeys.length > 0 || config.dcError) {
    out('');
    out(`STOP: Zoho Sign is not configured. ${config.dcError || `Missing in .env: ${config.missingKeys.join(', ')}`}`);
    process.exitCode = 1;
    return;
  }

  heading('Fixture PDF');
  const pdfBuffer = await buildFixturePdf(PROBES);
  fs.writeFileSync(outPath, pdfBuffer);
  out(`Wrote ${pdfBuffer.length} bytes to ${outPath}`);
  out('It is a generated test page. It contains no customer data.');

  const email = String(args.values.email || '').trim();
  const recipients = [fixtureRecipient(email || 'calibration@example.invalid')];
  const fields = fixtureFields();

  const mapped = mapRecipientsToZohoActions(recipients, {});
  const { byRecipient } = mapSignatureFieldsToZoho(fields, {
    pageSizes: { 1: PAGE },
    pageSize: PAGE,
    origin: config.coordOrigin,
    unit: config.coordUnit,
  });
  const probeFields = byRecipient.get('000000000000000000000001') || [];

  heading(`What we are asking Zoho for (origin=${config.coordOrigin}, unit=${config.coordUnit})`);
  out('probe  asked norm        asked pt (top-left origin)   sent to Zoho');
  PROBES.forEach((probe, index) => {
    const field = probeFields[index] || {};
    const askedX = Math.round(probe.xNorm * PAGE.width);
    const askedY = Math.round(probe.yNorm * PAGE.height);
    out(
      `${probe.id.padEnd(6)} (${String(probe.xNorm).padEnd(5)}, ${String(probe.yNorm).padEnd(5)})  `
      + `x=${String(askedX).padStart(3)} y=${String(askedY).padStart(3)}                  `
      + `x_coord=${field.x_coord} y_coord=${field.y_coord} w=${field.abs_width} h=${field.abs_height} page_no=${field.page_no}`,
    );
  });

  const createPayload = buildCreateRequestPayload({
    requestName: `CPQ coordinate calibration ${new Date().toISOString().slice(0, 19)}`,
    actions: mapped.actions,
    notes: 'Automated coordinate calibration probe. Not a customer document.',
    isSequential: false,
    expirationDays: 1,
    emailReminders: false,
  });

  heading('POST /requests payload (data)');
  out(JSON.stringify(createPayload, null, 2));

  heading('POST /requests/{id}/submit payload (fields, with placeholder ids)');
  out(JSON.stringify(buildSubmitPayload(['<action_id>'], mapped.actions, mapped.recipientIds, byRecipient), null, 2));

  if (!wantsCheck && !wantsSend) {
    heading('Dry run complete');
    out('No network call was made.');
    out('Next: node scripts/zoho-calibrate.cjs --check          (live, read-only, costs no document)');
    out('Then: node scripts/zoho-calibrate.cjs --send --email=you@cloudfuze.com --confirm-one-document');
    return;
  }

  const auth = createZohoSignAuth({ config, httpRequest });
  const client = createZohoSignClient({
    config,
    auth,
    httpRequest,
    logger: (message) => out(`   ${message}`),
  });

  if (wantsCheck) {
    heading('Live read-only check');
    try {
      const list = await client.listRequests({ rowCount: 1 });
      out('OAuth refresh succeeded and GET /requests answered.');
      out(`Zoho code=${list && list.code}, status=${list && list.status}`);
      const expiry = auth.peekTokenExpiry();
      out(`Access token valid until ${expiry ? expiry.toISOString() : 'unknown'} (never printed).`);
      out('This consumed no trial document.');
    } catch (error) {
      out(`Check FAILED: ${redact(String(error && error.message)) || '[redacted]'}`);
      out(`code=${error && error.code} status=${error && error.status}`);
      process.exitCode = 1;
    }
    if (!wantsSend) return;
  }

  // ---- The one send ------------------------------------------------------

  heading('Live send');
  if (!args.flags.has('confirm-one-document')) {
    out('STOP: --send also needs --confirm-one-document.');
    out('A send emails a real person, and if testing=true is not honoured it spends one of the');
    out('account\'s 10 trial documents. That is a human decision, so it needs a human flag.');
    process.exitCode = 1;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    out('STOP: --send needs --email=<a real address you own>. Zoho will email it.');
    process.exitCode = 1;
    return;
  }

  // Zoho's pricing and getting-started pages say to pass "testing = true as a parameter", but the
  // create-document endpoint reference does not list it at all, so its placement is genuinely
  // unknown. Sending it BOTH as a form field and as a query parameter costs nothing and is the
  // only way to find out from a single send. Whether it was honoured is reported below.
  const testingExtras = useTesting
    ? { extraFields: { testing: 'true' }, query: { testing: 'true' } }
    : {};

  out(`Recipient: ${email}`);
  out(`testing=true: ${useTesting ? 'YES — sent as BOTH a form field and a query parameter' : 'NO (--no-testing) — this WILL spend a trial document'}`);

  let zohoRequest;
  try {
    zohoRequest = await client.createRequest(Object.assign({
      files: [{ buffer: pdfBuffer, fileName: 'cpq-zoho-calibration.pdf', contentType: 'application/pdf' }],
      data: createPayload,
    }, testingExtras));
  } catch (error) {
    out(`CREATE FAILED: ${redact(String(error && error.message)) || '[redacted]'}`);
    out(`code=${error && error.code} status=${error && error.status} zohoCode=${error && error.zohoCode}`);
    out('Nothing was submitted. No signer was emailed.');
    process.exitCode = 1;
    return;
  }

  const requestId = zohoRequest && zohoRequest.request_id;
  const documentId = zohoRequest && Array.isArray(zohoRequest.document_ids) && zohoRequest.document_ids[0]
    ? zohoRequest.document_ids[0].document_id
    : '';
  const actionId = zohoRequest && Array.isArray(zohoRequest.actions) && zohoRequest.actions[0]
    ? zohoRequest.actions[0].action_id
    : '';

  out(`request_id  = ${requestId}`);
  out(`document_id = ${documentId}`);
  out(`action_id   = ${actionId}`);

  const createSignals = findTestingSignals(zohoRequest);
  heading('Was testing=true honoured?');
  if (createSignals.length > 0) {
    createSignals.forEach((signal) => out(`  ${signal}`));
  } else {
    out('  Zoho echoed NOTHING test-related in the create response.');
    out('  That is not proof either way — Zoho does not document a test acknowledgement field.');
    out('  CONFIRM IT BY HAND before sending a second document: open Zoho Sign in a browser and');
    out('  check whether this request is watermarked / marked as a test, and whether the trial');
    out('  document count moved. GET /api/v1/account does NOT exist (code 9004), so the count');
    out('  cannot be read over the API.');
    out('  DO NOT SEND ANOTHER DOCUMENT UNTIL THAT IS ANSWERED.');
  }

  if (!documentId || !actionId) {
    out('');
    out('STOP: Zoho returned no document_id or action_id, so the fields cannot be placed.');
    out('A draft now exists in the Zoho account and should be deleted by hand.');
    process.exitCode = 1;
    return;
  }

  const submitPayload = buildSubmitPayload([actionId], mapped.actions, mapped.recipientIds, byRecipient);
  submitPayload.requests.actions.forEach((action) => {
    action.fields.forEach((field) => { field.document_id = String(documentId); });
  });

  try {
    await client.submitRequest(requestId, submitPayload);
  } catch (error) {
    out(`SUBMIT FAILED: ${redact(String(error && error.message)) || '[redacted]'}`);
    out(`code=${error && error.code} status=${error && error.status} zohoCode=${error && error.zohoCode}`);
    out(`A draft (request_id ${requestId}) exists at Zoho and should be deleted by hand.`);
    out('A field_type_name or action-attribute rejection shows up exactly here — check zoho-sign-mapper.cjs.');
    out('zohoCode 9039 is generic and names nothing; 9043 puts the offending key in error_param.');
    process.exitCode = 1;
    return;
  }

  let after = null;
  try {
    after = await client.getRequest(requestId);
  } catch (error) {
    out(`(Could not re-read the request: ${redact(String(error && error.message)) || '[redacted]'})`);
  }

  heading('Result');
  out(`request_status = ${after && after.request_status}`);
  const afterSignals = findTestingSignals(after);
  if (afterSignals.length > 0) {
    out('Test-related fields on the stored request:');
    afterSignals.forEach((signal) => out(`  ${signal}`));
  }

  heading('Now go and look');
  out(`1. Open Zoho Sign (${config.apiBase.replace('/api/v1', '')}) and find the request named:`);
  out(`   "${createPayload.requests.request_name}"`);
  out(`   request_id ${requestId}`);
  out(`2. Or open the signing email sent to ${email}.`);
  out('3. Compare each Zoho field against the RED OUTLINE printed underneath it.');
  out('');
  out('   On the outline everywhere ......... origin and unit in .env are correct. Pin them in a test.');
  out('   Mirrored top-to-bottom ............ ZOHO_SIGN_COORD_ORIGIN is the other one.');
  out('   Consistently ~75% of the distance . we sent pt, Zoho wanted px. Set ZOHO_SIGN_COORD_UNIT=px.');
  out('   Consistently ~133% .................. we sent px, Zoho wanted pt.');
  out('   Some other constant ratio ......... measure it and use the mapper unitScale knob.');
  out('');
  out(`4. Fixture PDF for side-by-side comparison: ${outPath}`);
  out('5. Record the answer in .env (ZOHO_SIGN_COORD_ORIGIN / ZOHO_SIGN_COORD_UNIT) and pin it');
  out('   in tests/unit/zohoSignMapper.test.ts, which today deliberately asserts neither.');
}

main().catch((error) => {
  process.stderr.write(`zoho-calibrate failed: ${error && error.message}\n`);
  process.exitCode = 1;
});
