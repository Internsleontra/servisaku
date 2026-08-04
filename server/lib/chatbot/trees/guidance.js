// ─────────────────────────────────────────────────────────────────────────────
// Partner service-guidance trees.
//
// Same runner again; a leaf here carries a CHECKLIST rather than a service or a
// resolution. Authored rather than generated because this is the content most
// likely to be wrong in a way that hurts someone — "isolate before you open the
// unit" is not a sentence to leave to a model.
//
// Every checklist ends with an evidence step, because a job without completion
// photos cannot be defended when a customer disputes it (Partner Terms 11.18).
// ─────────────────────────────────────────────────────────────────────────────

const STAGE = {
  ask: {
    en: 'Which part do you want — preparation, method, or finishing and handover?',
    ms: 'Bahagian mana — persediaan, kaedah, atau penyelesaian dan penyerahan?',
  },
  labels: {
    prep: { en: 'Preparation', ms: 'Persediaan' },
    method: { en: 'Method', ms: 'Kaedah' },
    finish: { en: 'Finishing', ms: 'Penyelesaian' },
  },
};

/** All five guidance trees share one shape: pick a stage, get that checklist. */
const guidanceTree = (id, category, leaves) => ({
  id,
  audience: 'partner',
  category,
  root: 'stage',
  nodes: {
    stage: {
      ask: STAGE.ask,
      answers: {
        prep: { leaf: 'prep', label: STAGE.labels.prep },
        method: { leaf: 'method', label: STAGE.labels.method },
        finish: { leaf: 'finish', label: STAGE.labels.finish },
        unknown: { leaf: 'method' },
      },
    },
  },
  leaves,
});

export const GUIDANCE_TREES = [
  guidanceTree('guide_aircon', 'aircon', {
    prep: {
      checklist: [
        'Isolate power at the breaker before opening the unit — not just the remote.',
        'Sheet the wall and floor; chemical wash runoff stains paint and grout.',
        'Photograph the coil and the drain tray before you touch anything.',
        'Confirm the unit count with the customer against the booking.',
      ],
    },
    method: {
      checklist: [
        'Remove and soak the filters while you work on the coil.',
        'Apply coil cleaner and let it dwell for the product time — rushing it leaves residue.',
        'Flush the drain line fully; a partial flush is the single most common callback.',
        'Check the gas pressure only if you are certified to; otherwise report and stop.',
      ],
    },
    finish: {
      checklist: [
        'Reassemble and run a 10-minute cooling test with the customer present.',
        'Confirm the outlet temperature has dropped before you call it done.',
        'Clear all runoff and packaging — nothing of yours stays behind.',
        'Upload before and after photos of the coil. Without them the job cannot close.',
      ],
    },
  }),

  guidanceTree('guide_plumbing', 'plumbing', {
    prep: {
      checklist: [
        'Shut the mains and confirm it is actually off before opening any joint.',
        'Photograph the leak before you touch it — that is your evidence if scope is queried.',
        'Lay down towels or a tray; water damage to a floor becomes your claim.',
        'Check whether the fault is the joint before assuming the pipe.',
      ],
    },
    method: {
      checklist: [
        'Replace seals and washers rather than over-tightening a fitting.',
        'If a part is needed, quote it through the app and get in-app approval first.',
        'Work done without in-app approval is not collectable — Partner Terms 6.17.',
        'Never conceal a repair behind a panel without showing the customer first.',
      ],
    },
    finish: {
      checklist: [
        'Run the fixture for at least two minutes and check the joint dry.',
        'Restore the mains and check for pressure loss elsewhere.',
        'Show the customer the repair before you pack up.',
        'Upload before and after photos including the dry joint.',
      ],
    },
  }),

  guidanceTree('guide_electrical', 'electrical', {
    prep: {
      checklist: [
        'Isolate at the DB and lock off. Tell the household what you have switched off.',
        'Test dead before touching any conductor — every time, no exceptions.',
        'Never work live, and never on a wet floor.',
        'If the job needs a competency certificate you do not hold, decline it.',
      ],
    },
    method: {
      checklist: [
        'Match cable size and breaker rating; do not upsize a breaker to stop a trip.',
        'A repeatedly tripping circuit is a fault, not a nuisance — find it.',
        'Terminate properly: no taped joints, no chocolate blocks in a wall.',
        'If the installation is unsafe beyond your scope, stop and report it.',
      ],
    },
    finish: {
      checklist: [
        'Test the circuit under load before restoring everything.',
        'Restore all isolated circuits and confirm the household is back to normal.',
        'Explain what was faulty in plain language.',
        'Upload photos of the terminated work before you close the panel.',
      ],
    },
  }),

  guidanceTree('guide_cleaning', 'cleaning', {
    prep: {
      checklist: [
        'Walk the property with the customer and agree the scope before you start.',
        'Photograph any pre-existing damage or staining — this is what protects you later.',
        'Identify delicate surfaces: natural stone, leather, silk, engineered wood.',
        'Confirm what is out of scope so it does not become an argument at the end.',
      ],
    },
    method: {
      checklist: [
        'Top down, dry before wet — reversing that means doing rooms twice.',
        'Test any chemical on an inconspicuous area of an unfamiliar surface first.',
        'Never mix bleach with acidic cleaners.',
        'Ventilate throughout, particularly in enclosed bathrooms.',
      ],
    },
    finish: {
      checklist: [
        'Walk the property with the customer before you leave.',
        'Remove all waste and packaging.',
        'Before, during and after photos are required for cleaning categories.',
        'Photographs must be of the actual address and unedited — Partner Terms 11.18.',
      ],
    },
  }),

  guidanceTree('guide_painting', 'painting', {
    prep: {
      checklist: [
        'Mask and sheet everything before opening a tin, including floors and fittings.',
        'Photograph the surface condition before preparation.',
        'Fill, sand and prime — most complaints are preparation, not paint.',
        'Agree the exact colour and finish with the customer in writing in the app.',
      ],
    },
    method: {
      checklist: [
        'Emulsion needs 2–4 hours between coats in Malaysian humidity; longer if enclosed.',
        'Do not recoat a surface that is still cool to the touch — it lifts.',
        'Keep a wet edge; visible lap marks mean a redo at your cost.',
        'Ventilate continuously and keep the household out of the room.',
      ],
    },
    finish: {
      checklist: [
        'Remove masking while the final coat is still slightly soft to avoid tearing.',
        'Inspect in daylight and touch up before the walkthrough, not after.',
        'Take all waste with you; paint tins are not household rubbish.',
        'Upload before and after photos of each surface painted.',
      ],
    },
  }),
];

export const GUIDANCE_TREES_BY_ID = Object.fromEntries(GUIDANCE_TREES.map((tr) => [tr.id, tr]));
