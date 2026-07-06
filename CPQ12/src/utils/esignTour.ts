import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const STORAGE_LANDING = 'cpq_esign_tour_landing_v1';
const STORAGE_PLACE_FIELDS = 'cpq_esign_tour_place_fields_v1';

const baseConfig = {
  showProgress: true,
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
  overlayOpacity: 0.45,
  smoothScroll: true,
  allowClose: true,
  disableActiveInteraction: false,
} as const;

function markLandingComplete() {
  try {
    localStorage.setItem(STORAGE_LANDING, '1');
  } catch {
    /* ignore */
  }
}

function markPlaceFieldsComplete() {
  try {
    localStorage.setItem(STORAGE_PLACE_FIELDS, '1');
  } catch {
    /* ignore */
  }
}

export function shouldAutoStartLandingTour(): boolean {
  try {
    return !localStorage.getItem(STORAGE_LANDING);
  } catch {
    return false;
  }
}

export function shouldAutoStartPlaceFieldsTour(): boolean {
  try {
    return !localStorage.getItem(STORAGE_PLACE_FIELDS);
  } catch {
    return false;
  }
}

function buildLandingSteps(hasPlaceFieldsAnchor: boolean): DriveStep[] {
  const steps: DriveStep[] = [
    {
      popover: {
        title: 'How e sign works',
        description:
          'Upload a PDF, add recipients, place signature fields on the document, then send for signature. This short tour highlights where to do each step.',
        side: 'over',
        align: 'center',
      },
    },
    {
      element: '#esign-tour-upload',
      popover: {
        title: 'Upload a document',
        description:
          'Choose a PDF agreement. After a successful upload, you’ll open the Place Fields screen to add signers and fields.',
        side: 'bottom',
      },
    },
    {
      element: '#esign-tour-documents',
      popover: {
        title: 'Your documents',
        description:
          'Drafts stay here until you send. After sending, use View status to see progress.',
        side: 'top',
      },
    },
  ];

  if (hasPlaceFieldsAnchor) {
    steps.push({
      element: '#esign-tour-place-fields',
      popover: {
        title: 'Place fields',
        description:
          'Open a draft to add recipients, drag Signature, Name, Date, and other fields onto the PDF, then send for signature.',
        side: 'left',
      },
    });
  } else {
    steps.push({
      popover: {
        title: 'Place fields',
        description:
          'When you have a draft in this list, use Place fields to add recipients and drag fields onto the document before sending.',
        side: 'over',
        align: 'center',
      },
    });
  }

  return steps;
}

function buildPlaceFieldsSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Place Fields',
        description:
          'Add who will sign, choose which person each field belongs to, drag fields onto the pages, then send the envelope.',
        side: 'over',
        align: 'center',
      },
    },
    {
      element: '#esign-tour-recipients-panel',
      popover: {
        title: 'Add recipients',
        description:
          'Enter name and email, choose Signer or Reviewer, then Add recipient. Order matters for routing. You can also use saved groups or saved recipients.',
        side: 'left',
      },
    },
    {
      element: '#esign-tour-place-for-select',
      popover: {
        title: 'Who is this field for?',
        description:
          'Pick a recipient before placing fields. Each field you drag is assigned to the person selected here.',
        side: 'left',
      },
    },
    {
      element: '#esign-tour-field-palette',
      popover: {
        title: 'Drag fields onto the PDF',
        description:
          'Drag Signature, Name, Title, Date, or Text from here onto the document preview. Scroll to the right page first if needed.',
        side: 'left',
      },
    },
    {
      element: '#esign-tour-pdf-preview',
      popover: {
        title: 'Document preview',
        description:
          'Drop fields where signers should complete them. You can move and resize placed fields.',
        side: 'right',
      },
    },
    {
      element: '#esign-tour-send-signature',
      popover: {
        title: 'Send for signature',
        description:
          'When recipients and fields are ready, send. Signers receive email links to complete their parts.',
        side: 'bottom',
      },
    },
  ];
}

export function startEsignLandingTour(hasPlaceFieldsAnchor: boolean) {
  const steps = buildLandingSteps(hasPlaceFieldsAnchor);
  const d = driver({
    ...baseConfig,
    steps,
    onDestroyed: () => {
      markLandingComplete();
    },
  });
  d.drive();
}

export function startEsignPlaceFieldsTour() {
  const steps = buildPlaceFieldsSteps();
  const d = driver({
    ...baseConfig,
    steps,
    onDestroyed: () => {
      markPlaceFieldsComplete();
    },
  });
  d.drive();
}
