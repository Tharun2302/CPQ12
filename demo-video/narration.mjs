// The narration, as named beats. record.mjs plays each beat's audio while running that beat's screen actions.
// Conventions:
//   - one string per sentence; tts.mjs renders sentence by sentence and joins them with natural gaps
//   - a trailing " *" marks a key point (longer pause after it)
//   - {shown|spoken} shows the first form in subtitles and speaks the second
//   - `chapter` starts a new chapter: a title card is shown and a longer pause precedes it

// DEMO_VOICE=onecore falls back to the built-in Windows voice (no key needed), e.g. for a quick rehearsal.
export const VOICE = process.env.DEMO_VOICE === 'onecore'
  ? { engine: 'onecore', voice: 'Mark', rate: 0.92 }
  : { engine: 'openai', model: 'tts-1-hd', voice: 'nova', rate: 1.0 };
export const GAPS = { sentence: 250, keyPoint: 600, chapter: 1000 };

export const BEATS = [
  // ── 1. Welcome ──────────────────────────────────────────────
  { id: 'b01_welcome', chapter: 'Welcome to {Zenop.ai|Zenop dot A I}', lines: [
    'Hi, and welcome to the team.',
    "Over the next few minutes, I'll show you how a deal moves through {Zenop.ai|Zenop dot A I}, from a HubSpot deal all the way to a signed contract.",
    "Don't worry about memorising every field. I'll point out the few things you really need to get right.",
  ] },
  { id: 'b02_login', lines: [
    "This is where you sign in. You'll use Continue with Microsoft, with your normal CloudFuze account.",
    "Most days, though, you'll arrive from HubSpot, by clicking the {Zenop.ai|Zenop dot A I} link on a deal.",
    "So let's follow one deal, start to finish.",
  ] },

  // ── 2. One deal, start to finish ────────────────────────────
  { id: 'b03_deal', chapter: 'One deal, start to finish', lines: [
    "Meet Priya. She's a sales rep on the S M B team, and she's quoting Northwind Logistics.",
    'Northwind wants to move from Box to OneDrive and SharePoint.',
    'Notice that the deal, the contact and the company are already filled in from HubSpot.',
    'You never retype customer details. *',
    'Priya clicks Use Deal Data, and we land on Configure.',
  ] },
  { id: 'b04_configure_pick', lines: [
    'Configure is where you describe the migration.',
    "For most deals you'll pick Multi-Combination, because one agreement can hold several migrations.",
    "You can tick more than one option in this list. We'll come back to that later.",
    "Then you search for the exhibit that matches the project. Here, that's Box to Microsoft.",
  ] },
  { id: 'b05_configure_numbers', lines: [
    'Now the numbers that drive the price.',
    'Two hundred and fifty users, one instance, twelve hundred gigabytes of data, and a three month project.',
    "Watch the pricing panel on the right. It updates as you type, so there's no submit button to hunt for.",
    'Priya picks the Standard plan, because Northwind wants the managed migration.',
  ] },
  { id: 'b06_discount', lines: [
    "Here's the important part. Discounts are capped by an admin, and right now the cap is fifteen percent.",
    'Priya tries twenty five percent, and the app brings it straight back down to fifteen.',
    "If a customer really needs more, talk to an approval admin. Don't try to work around it. *",
    'Priya settles on ten percent, and picks her plan.',
  ] },
  { id: 'b07_quote', lines: [
    'The Quote page picks the right agreement template for you, and carries over Northwind\'s details.',
    'Now, this next bit catches almost everyone the first time.',
  ] },
  { id: 'b08_dates_block', lines: [
    "Priya clicks Generate Agreement, and it's refused.",
    "The Project Start Date has to be after the Effective Date, and the dates it starts with don't meet that rule. *",
    "So she moves the start date to the first of December, which is after the effective date.",
  ] },
  { id: 'b09_generate', lines: [
    'Now Generate works. It can take up to half a minute, so give it a moment.',
  ] },
  { id: 'b09b_preview', lines: [
    "And here's the agreement, with Northwind's name, the migration, and the pricing all filled in.",
    'Read it properly before you send it, because what you send is exactly what the approvers see. *',
  ] },
  { id: 'b09c_redline', lines: [
    'And if anything in the generated agreement needs changing, click Edit for RedLine.',
  ] },
  { id: 'b09d_redline_editor', lines: [
    'It opens the agreement in a Word-style editor, right in the browser.',
    'Change the wording, fix a typo, or add a clause, just as you would in Word. *',
    'When you finish, click File, then Save, and then Done. The agreement is updated with your edits.',
    "Priya doesn't need any changes today, so she clicks Close, and the agreement stays as it was.",
  ] },
  { id: 'b10_send', lines: [
    'Priya clicks Send for Approval, and checks the team lead group. S M B is already picked for her.',
    'That sends it to Marcus, her team lead. After Marcus, it goes to the Technical team, and then to Legal.',
    'Each step happens in order, and nobody can skip ahead.',
  ] },
  { id: 'b10b_sent', lines: [
    'The approval has started, and Priya lands on her Approval tab, at step one of three.',
  ] },

  // ── 3. The hand-off ─────────────────────────────────────────
  { id: 'b11_marcus', chapter: 'The hand-off between teams', lines: [
    "Okay, so now let's switch seats. This is Marcus, the team lead.",
    "Approvers don't open the app and go looking. They just click the link in their email.",
    'Marcus reads the agreement, and approves.',
  ] },
  { id: 'b12_aisha', lines: [
    'That approval automatically emails the Technical team, and Aisha picks it up.',
    'In real life, technical approvers sign in with Microsoft first, so the app records exactly who approved.',
    'Aisha checks the scope looks realistic, and approves.',
  ] },
  { id: 'b13_daniel', lines: [
    'Then Legal. Daniel gives the final approval.',
    "Notice what just happened. Priya didn't chase anyone. Each approval handed the deal to the next team. *",
  ] },
  { id: 'b14_back_to_priya', lines: [
    "Back on Priya's Approval tab, the card shows every step, and how long each one took.",
    "And because it's fully approved, there's now a green e-Sign button.",
  ] },

  // ── 4. Getting it signed ────────────────────────────────────
  { id: 'b15_recipients', chapter: 'Getting it signed', lines: [
    'e-Sign is where you choose who signs, and where.',
    "Tom, Northwind's finance director, will review it. Emma, the I T Director, signs it.",
  ] },
  { id: 'b16_checklist', lines: [
    'See the checklist? Review and Send stays greyed out until every signer has a signature field. *',
    'So Priya selects Emma, goes to the signature page, and drags a signature box and a date onto it.',
  ] },
  { id: 'b16b_send', lines: [
    'Now the checklist is green, so she sends it.',
  ] },
  { id: 'b17_waiting', lines: [
    'Tom opens his link, reads the agreement, and approves it as the reviewer.',
    'Back on e sign status, the agreement now says Waiting for others.',
    "This is the waiting state. Nothing's broken. It's simply with the customer. *",
    'If it sits too long, use Send Reminder from this menu. Links last fifteen days, and you can extend them.',
  ] },
  { id: 'b18_emma', lines: [
    'Then Emma opens hers. She clicks the Sign Here box, adopts a typed signature, and clicks Finish.',
  ] },
  { id: 'b19_completed', lines: [
    "And that's it. The status is Completed, and the signed PDF is stored right here.",
    'From HubSpot deal to signed contract, without chasing a single email by hand.',
  ] },

  // ── 5. When an approver says no ─────────────────────────────
  { id: 'b20_harbor_intro', chapter: 'When an approver says no', lines: [
    "Not every deal goes straight through, so let's look at a rejection.",
    'Priya has quoted Harbor Health Partners, a Slack to Teams migration, with two hundred thousand messages.',
    'Marcus has already approved it, so it\'s with the Technical team.',
  ] },
  { id: 'b21_aisha_deny', lines: [
    'But Aisha knows Harbor has about two million messages.',
    'She clicks Deny without writing anything, and the app stops her. A denial always needs a reason. *',
    "So she explains what's wrong, and denies.",
  ] },
  { id: 'b22_rejected', lines: [
    "Priya gets an email straight away, and her card now says Rejected, with Aisha's comment.",
    "Here's the important part. A rejected approval is closed for good. There's no resubmit button. *",
    'So Priya fixes the message count on Configure, generates a new agreement, and sends a fresh approval.',
  ] },
  { id: 'b23_new_approval', lines: [
    'And there it is. A brand new approval, back at step one with Marcus.',
  ] },

  // ── 6. Overage shortcut ─────────────────────────────────────
  { id: 'b24_overage', chapter: 'A shortcut for Overage deals', lines: [
    'One shortcut worth knowing. Brightline Media needs an Overage Agreement, which is priced on server instances rather than users.',
    'Priya picks Overage Agreement, sets the instances, and sends it for approval as usual.',
  ] },
  { id: 'b25_skip', lines: [
    'When Marcus approves an overage deal, the Technical step is skipped automatically, and it goes straight to Legal.',
    "Hover over Tech on the card and you'll see the note, skipped for overage agreement. That's expected. *",
  ] },

  // ── 7. Several migrations in one quote ──────────────────────
  { id: 'b25a_combine_pick', chapter: 'Several migrations in one quote', lines: [
    'You can also select multiple migration options within a single quote.',
    'Lakeside Bank needs a Box migration, overage server instances, and Data Sprawl.',
    'So Priya opens the Migrate list and ticks Multi-Combination, Overage Agreement and Data Sprawl, all together. *',
    'They are all quoted in one agreement.',
  ] },
  { id: 'b25b_combine_sections', lines: [
    'Each option she ticks adds its own section.',
    'She picks the migration exhibit at the top, and enters the Duration once.',
    'Then the Data Sprawl exhibits, and the number of overage instances.',
    'Data Sprawl and Overage both use that same Duration, so the whole quote runs on one term. *',
  ] },
  { id: 'b25c_combine_rules', lines: [
    'Combine options as needed, based on the supported combinations. You can tick one option of each kind.',
    'D I Y is the exception. Tick it, and everything else is cleared, because a D I Y licence is always quoted on its own. *',
  ] },

  // ── 8. Your day ─────────────────────────────────────────────
  { id: 'b26_approval_tab', chapter: 'Your day in {Zenop.ai|Zenop dot A I}', lines: [
    'So, where do you find your own work?',
    'Start with the Approval tab. These counters at the top double as filters.',
    "Pick yourself in the requester filter, and you'll see only your deals.",
  ] },
  { id: 'b27_waiting_times', lines: [
    'Each card shows how long every step took. Fabrikam, for example, has been waiting on Legal for a few hours.',
    'If something is stuck, this menu has Reminder, which nudges whoever has it now.',
  ] },
  { id: 'b28_esign_tab', lines: [
    "Then there's e sign status, for everything that's out for signature.",
    'The tabs split it into Completed, Pending and Rejected, so you can see at a glance what needs you.',
  ] },

  // ── 9. Rules of the road ────────────────────────────────────
  { id: 'b29_recap', chapter: 'The rules of the road', lines: [
    "Let's wrap up with the five things to remember.",
    'Start from the HubSpot deal, so customer details are always right.',
    'Keep discounts within the cap.',
    'Set the Project Start Date after the Effective Date.',
    'Read the agreement before you send it, because a rejection means a brand new approval.',
    "And if you're approving, always say why when you deny. *",
  ] },
  { id: 'b30_outro', lines: [
    "That's the whole journey. You'll pick it up quickly, and if you get stuck, Help, down here, reaches the team.",
    'Welcome aboard.',
  ] },
];

// Subtitle text and spoken text for one sentence.
export function shownText(line) {
  return line.replace(/\s\*$/, '').replace(/\{([^|}]+)\|[^}]+\}/g, '$1').replace(/\bS M B\b/g, 'SMB').replace(/\bI T\b/g, 'IT').replace(/\bD I Y\b/g, 'DIY');
}
export function spokenText(line) {
  return line.replace(/\s\*$/, '').replace(/\{[^|}]+\|([^}]+)\}/g, '$1');
}
export const isKeyPoint = (line) => /\s\*$/.test(line);
export const chapterTitle = (beat) => (beat.chapter ? shownText(beat.chapter) : null);
