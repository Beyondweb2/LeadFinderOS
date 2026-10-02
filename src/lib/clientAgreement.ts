/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINDABLE CLIENT SERVICE AGREEMENT — the ONE copy of its words (Paul, 2026-10-02).

   ⛔ THE WORDING IS PAUL'S, TAKEN VERBATIM FROM Findable_Client_Service_Agreement.pdf AS VERSION "v1".
   Do not edit a word of a published version. A change is a NEW version: copy the block, give it a new
   id, and point CLIENT_AGREEMENT_VERSION at it. scripts/client-agreement.test.ts pins v1's fingerprint,
   so an edit that forgets to bump the version fails the gate.

   ⛔ ONE SOURCE, THREE RENDERINGS. The agreement page (client-agreement edge function), the PDF copy
   (agreementPdf.ts) and the evidence fingerprint all read THESE blocks, so what the client saw, what
   they were emailed and what was hashed can never be three different documents.

   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — this module is reached from edge functions.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { REPORT_PUBLIC_ORIGIN } from './findableOffer.ts';

export const CLIENT_AGREEMENT_VERSION = 'v1';

/** A client's own agreement page: findable.live/agree/<token> (findable-site proxies it). */
export function agreementUrl(token: string): string {
  return `${REPORT_PUBLIC_ORIGIN}/agree/${token}`;
}
/** The general (blank) agreement — the URL Paul sets as Stripe's Terms of Service link. */
export const AGREEMENT_BLANK_URL = `${REPORT_PUBLIC_ORIGIN}/agreement`;
export const CLIENT_AGREEMENT_TITLE = 'Client Service Agreement';

export type AgreementRoute = 'build' | 'optimise';

/** One block of the agreement body. `lead` is a bold run-in heading at the start of a clause. */
export type AgreementBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'clause'; num: string; lead?: string; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'note'; text: string };

export interface AgreementVersion {
  version: string;
  intro: string;
  findableDetails: Array<[string, string]>;
  clientDetailLabels: {
    businessName: string; legalName: string; contact: string; address: string;
    email: string; phone: string; website: string;
  };
  services: Record<AgreementRoute, { name: string; description: string }>;
  serviceNote: string;
  body: AgreementBlock[];
  schedule: { title: string; columns: [string, string]; rows: Array<[string, string, string]> };
  signatures: { title: string; intro: string; findableName: string };
}

const V1: AgreementVersion = {
  version: 'v1',
  intro: 'This agreement covers your Findable service: what we do, what you pay, who owns what, and what happens if either of us wants to stop. Please check your details, sign the last page and send it back.',
  findableDetails: [
    ['Business name', 'Findable'],
    ['Run by', 'Paul James Sales'],
    ['Legal status', 'Sole trader, trading as Findable'],
    ['Email for notices', 'paul@findable.live'],
    ['Website', 'https://findable.live/'],
  ],
  clientDetailLabels: {
    businessName: 'Business name',
    legalName: 'Legal name of the business (and company number, if a company)',
    contact: 'Contact name and role',
    address: 'Business address',
    email: 'Email for notices',
    phone: 'Phone',
    website: 'Website domain (if any)',
  },
  services: {
    build: { name: 'Findable Build', description: 'We build and manage a new website. £99 initial payment, then £99 a month. 12 payments in total (1 initial + 11 monthly).' },
    optimise: { name: 'Findable Optimise', description: 'We improve your existing website. £99 initial payment, then £99 a month. 6 payments in total (1 initial + 5 monthly).' },
  },
  serviceNote: 'Monthly payments start six weeks after your initial payment. Findable is not VAT registered, so no VAT is added.',
  body: [
    { kind: 'heading', text: '1. ABOUT THIS AGREEMENT' },
    { kind: 'clause', num: '1.1', text: 'This agreement is between Paul James Sales, trading as Findable ("Findable", "we", "us") and the business named above ("you").' },
    { kind: 'clause', num: '1.2', text: 'You can accept this agreement electronically, by ticking the box at checkout before you pay, or by clicking "I agree and sign" on your agreement page. Either one counts as your signature, in the same way as signing on paper. You can also sign the last page if you prefer.' },
    { kind: 'clause', num: '1.3', text: 'The agreement starts on the date you first accept it in any of these ways (the "Start Date"). We will email you a copy of exactly what you agreed to.' },
    { kind: 'clause', num: '1.4', text: 'You confirm you are entering this agreement for your business, not as a private consumer, and that the person signing has authority to bind the business.' },
    { kind: 'clause', num: '1.5', text: 'Schedule 1 sets out what is included in each service. If anything in Schedule 1 conflicts with the main agreement, the main agreement applies.' },

    { kind: 'heading', text: '2. THE SERVICE' },
    { kind: 'clause', num: '2.1', text: 'We will provide the service you have chosen, as described in Schedule 1, with reasonable skill and care. In short, we measure how often AI tools name your business, improve your website and public business information so it is clearer and easier for search engines and AI systems to read and verify, and then measure again.' },
    { kind: 'clause', num: '2.2', text: 'We decide the best way to carry out the work, based on our measurements and experience. We will consult you on anything that changes how your business is described.' },
    { kind: 'clause', num: '2.3', text: 'Anything not listed in Schedule 1 is not included, for example online shops, booking systems, paid advertising, photography, logo design, email hosting or large new features. We are happy to quote for extra work separately.' },
    { kind: 'clause', num: '2.4', text: 'Reasonable website changes during the term are included. We may say no to, or quote separately for, a change that is really a new project.' },

    { kind: 'heading', text: '3. PAYMENTS' },
    { kind: 'clause', num: '3.1', text: 'You pay a £99 initial payment, then £99 a month starting six weeks after the initial payment, until the total number of payments for your service has been made (12 for Build, 6 for Optimise, counting the initial payment).' },
    { kind: 'clause', num: '3.2', text: 'Payments are taken automatically by card through our payment provider (currently Stripe). You agree to keep a valid payment method in place for the whole term.' },
    { kind: 'clause', num: '3.3', text: 'If a payment fails, we will let you know and try again. If a payment is still unpaid 14 days after its due date, we may pause the work and take down the website we built (or, for Findable Optimise, remove the pages and content we added to your website) until everything owed is paid. We will tell you before we do this. Taking the site down does not reduce what you owe: the remaining payments for your minimum term must still be paid.' },
    { kind: 'clause', num: '3.4', text: 'If any amount is overdue, we may charge statutory interest and fixed compensation under the Late Payment of Commercial Debts (Interest) Act 1998, plus our reasonable costs of recovering the debt.' },
    { kind: 'clause', num: '3.5', text: 'The price is fixed for your term. We will not increase your monthly payment during the term.' },

    { kind: 'heading', text: '4. YOUR MINIMUM TERM' },
    { kind: 'clause', num: '4.1', text: 'Your service has a minimum term: you agree to make all 12 payments (Build) or all 6 payments (Optimise). This is not a cancel-any-time service.' },
    { kind: 'clause', num: '4.2', text: 'You may end this agreement early at any time by email. If you do (other than under the guarantee in clause 5 or because we have seriously broken this agreement under clause 15.3), the remaining payments for your minimum term stay payable, on their normal dates or, if you prefer, in one go.' },
    { kind: 'clause', num: '4.3', text: 'Ownership of the website and our work only passes to you once every payment has been made (clause 8). If you end early and pay the remaining balance, ownership passes to you on that final payment in the normal way.' },

    { kind: 'heading', text: '5. MEASUREMENT AND THE GUARANTEE' },
    { kind: 'clause', num: '5.1', lead: 'Baseline.', text: 'Before the main work starts, we ask a set of real customer-style questions (currently 20 questions, each asked 3 times, on ChatGPT and Gemini) and count how many answers name your business. The questions are then fixed.' },
    { kind: 'clause', num: '5.2', lead: 'Re-measurement.', text: 'We repeat the measurement with the same questions, the same AI tools and the same method, four weeks after the baseline. We send you the before and after.' },
    { kind: 'clause', num: '5.3', lead: 'The guarantee.', text: 'If the number of answers that name your business at the re-measurement is not higher than at the baseline, you may claim a refund of your £99 initial payment by emailing us within 14 days of receiving your results.' },
    { kind: 'clause', num: '5.4', text: 'If you claim the refund, this agreement ends straight away and no further payments are owed. Because the agreement ends before your final payment, the website and our work do not pass to you (clause 8.6).' },
    { kind: 'clause', num: '5.5', text: 'The guarantee depends on you giving us the access, information and approvals we ask for under clause 7. If you are late doing this, we may move the re-measurement back by the same amount of time.' },
    { kind: 'clause', num: '5.6', text: 'The guarantee in this clause is the only guarantee we give about results.' },

    { kind: 'heading', text: '6. RESULTS ARE NOT GUARANTEED' },
    { kind: 'clause', num: '6.1', text: 'ChatGPT, Gemini, Google and other AI and search systems are run by third parties. We do not control them and cannot see how they decide what to say. They change often, and the same question can get different answers on different days.' },
    { kind: 'clause', num: '6.2', text: 'So, apart from clause 5, we do not promise that any AI tool will name, recommend or cite your business, that you will rank in any position, or that you will get more customers, enquiries or income.' },

    { kind: 'heading', text: '7. WHAT YOU NEED TO DO' },
    { kind: 'clause', num: '7.1', text: 'You agree to:' },
    { kind: 'bullet', text: 'give us, within 7 days of us asking, the access we reasonably need: for example to your domain or DNS settings, your existing website, your Google Business Profile and relevant directory listings;' },
    { kind: 'bullet', text: 'give us accurate, up-to-date information about your business, services, areas, prices, credentials and contact details, and tell us promptly if anything changes;' },
    { kind: 'bullet', text: 'reply to requests for approval within 7 days. If you do not, we may treat the work as approved so it can go live;' },
    { kind: 'bullet', text: 'only give us material (text, photos, logos, designs and other content) that you own or have permission to use; and' },
    { kind: 'bullet', text: 'make sure you are allowed to give us access to anything managed by a third party, such as a web agency, and deal with that third party yourself where needed.' },
    { kind: 'clause', num: '7.2', text: 'We are not responsible for delays, or for any effect on results, caused by you not doing these things.' },

    { kind: 'heading', text: '8. OWNERSHIP AND COPYRIGHT' },
    { kind: 'clause', num: '8.1', lead: 'Your materials stay yours.', text: 'You keep ownership of your domain name, business name, logo, branding, photos and any content you give us ("Your Materials"). You give us permission to use, copy and adapt Your Materials only to provide the service and, where clause 8.9 allows, to show our work.' },
    { kind: 'clause', num: '8.2', lead: 'Our work is ours until you have paid in full.', text: 'We own the copyright and all other intellectual property in everything we create for you, including the website design, code, page layouts, written content, structured data and other materials ("Our Work"), until every payment for your minimum term has been made.' },
    { kind: 'clause', num: '8.3', lead: 'Your licence during the term.', text: 'While your payments are up to date, you have a non-exclusive, non-transferable licence to use Our Work, as part of your website and public business information, for your business.' },
    { kind: 'clause', num: '8.4', lead: 'Ownership passes on final payment.', text: 'When we receive your final payment, we assign to you the copyright in Our Work that was created specifically for you, and we waive any moral rights in it. On request, we will give you a copy of your website files and content within 14 days.' },
    { kind: 'clause', num: '8.5', lead: 'Our tools stay ours.', text: 'Our general tools, templates, code libraries, components, systems (including LeadFinderOS), methods and know-how ("Our Tools") stay ours. On final payment, you get a permanent, free licence to use any of Our Tools that form part of your website, as part of that website only.' },
    { kind: 'clause', num: '8.6', lead: 'If the agreement ends before final payment,', text: 'for any reason (including a guarantee refund), your licence to use Our Work ends on the same day. We may take down the website we built and remove pages and content we added to your existing website, or ask you to remove them, and you must stop using Our Work. Your Materials and your domain stay yours, and we will return any of Your Materials you ask for.' },
    { kind: 'clause', num: '8.7', lead: 'Third-party materials', text: 'such as fonts, stock images, plugins and open-source code are used under their own licences, which you must keep to. They are not assigned to you by this agreement.' },
    { kind: 'clause', num: '8.8', lead: 'Recreating your existing design.', text: 'If you ask us to keep the look or content of your current website, you confirm you own it or have permission for us to recreate it. We will not copy anyone else\'s copyrighted website or code.' },
    { kind: 'clause', num: '8.9', lead: 'Showing our work.', text: 'We may name you as a client and show the website in our portfolio, unless you ask us by email not to. We will only publish your results or a case study with your permission.' },

    { kind: 'heading', text: '9. DOMAIN AND HOSTING' },
    { kind: 'clause', num: '9.1', text: 'Your domain name is always yours. If we register a new domain for you, it will be registered in your name or transferred to you on request. We will never hold your domain back from you, whatever happens with this agreement.' },
    { kind: 'clause', num: '9.2', text: 'Findable Build: we host the website during the term at no extra cost. We use reputable hosting providers and take reasonable care to keep the site secure and backed up, but we cannot guarantee it will always be available, and we are not responsible for outages caused by hosting providers or other third parties.' },
    { kind: 'clause', num: '9.3', text: 'When your term ends and all payments are made, ongoing work and support stop unless we agree otherwise. You can then either move the website to your own hosting, with our help to transfer the files, or keep it hosted with us for the hosting fee we offer at the time.' },
    { kind: 'clause', num: '9.4', text: 'Findable Optimise: your website stays yours and on your own hosting. We will never take your own website offline. You remain responsible for your hosting, platform, plugins and anything your web agency or other suppliers do to it. We are not responsible for problems caused by changes others make to the site.' },

    { kind: 'heading', text: '10. LISTINGS, GOOGLE BUSINESS PROFILE AND REVIEWS' },
    { kind: 'clause', num: '10.1', text: 'Your Google Business Profile and directory accounts belong to you. Where you give us access, we will act on your behalf and only make changes that accurately describe your real business.' },
    { kind: 'clause', num: '10.2', text: 'Directories, review sites and Google make their own decisions about listings and reviews. We cannot control them.' },
    { kind: 'clause', num: '10.3', text: 'We will never create fake reviews, fake locations or fake listings. You agree to follow the law and each platform\'s rules when asking for reviews (for example, no fake reviews and no offering rewards for reviews).' },

    { kind: 'heading', text: '11. CONFIDENTIALITY' },
    { kind: 'clause', num: '11.1', text: 'Each of us will keep the other\'s confidential information private and only use it for this agreement. This includes login details, business information and our methods, measurements, pricing and systems. It does not cover information that is already public, or that the law requires to be disclosed.' },
    { kind: 'clause', num: '11.2', text: 'We will keep any login details you give us secure and only use them for the service. You can change them at any time.' },
    { kind: 'clause', num: '11.3', text: 'This clause continues after the agreement ends.' },

    { kind: 'heading', text: '12. DATA PROTECTION' },
    { kind: 'clause', num: '12.1', text: 'Each of us will comply with UK data protection law. Our privacy notice explains how we use the personal data of you and your staff.' },
    { kind: 'clause', num: '12.2', text: 'Where we host your website or handle enquiries made through it, we act as your processor for that personal data and you are the controller. When acting as your processor, we will:' },
    { kind: 'bullet', text: 'only process the data on your documented instructions, including this agreement;' },
    { kind: 'bullet', text: 'make sure anyone handling it is bound by confidentiality;' },
    { kind: 'bullet', text: 'keep it secure with appropriate technical and organisational measures;' },
    { kind: 'bullet', text: 'only use reputable sub-processors (such as hosting and email providers) bound by equivalent obligations, and tell you if we change them;' },
    { kind: 'bullet', text: 'help you, where reasonable, to respond to people exercising their data rights and to meet your own security and breach obligations;' },
    { kind: 'bullet', text: 'tell you without undue delay if we become aware of a breach affecting the data;' },
    { kind: 'bullet', text: 'delete or return the data when the service ends, unless the law requires us to keep it; and' },
    { kind: 'bullet', text: 'give you the information you reasonably need to show these obligations are being met.' },
    { kind: 'clause', num: '12.3', text: 'You are responsible for having a lawful basis for the data collected through your website, and for your own website privacy notice.' },

    { kind: 'heading', text: '13. LIABILITY' },
    { kind: 'clause', num: '13.1', text: 'Nothing in this agreement limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law does not allow to be limited.' },
    { kind: 'clause', num: '13.2', text: 'Neither of us is liable to the other for any indirect or consequential loss, or for loss of profit, income, business, customers or goodwill, including any loss from an AI tool or search engine not naming or ranking you.' },
    { kind: 'clause', num: '13.3', text: 'Our total liability to you under or in connection with this agreement is limited to the total amount you have paid us in the 12 months before the claim.' },
    { kind: 'clause', num: '13.4', text: 'We are not liable for anything caused by AI tools, search engines, directories, hosting providers, payment providers or other third parties, or by information or materials you gave us.' },
    { kind: 'clause', num: '13.5', text: 'You will cover our reasonable losses and costs if a third party makes a claim against us because Your Materials infringe their rights, because information you gave us was untrue, or because you were not allowed to give us access to something under clause 7.' },

    { kind: 'heading', text: '14. CHANGES' },
    { kind: 'clause', num: '14.1', text: 'We may improve our methods, tools and the detail of how we deliver the service over time, as long as the overall service you receive is not reduced.' },
    { kind: 'clause', num: '14.2', text: 'Any other change to this agreement only counts if we both agree it in writing (email is fine).' },

    { kind: 'heading', text: '15. ENDING THE AGREEMENT' },
    { kind: 'clause', num: '15.1', text: 'This agreement ends when you have made all your payments and the term is complete, or earlier under clauses 4, 5 or this clause 15.' },
    { kind: 'clause', num: '15.2', text: 'We may end this agreement by email if: a payment is more than 14 days overdue and still unpaid 7 days after we remind you; you seriously break this agreement and do not put it right within 14 days of us asking; you become insolvent or stop trading; or you or your staff are abusive or threatening towards us. Any payments due up to that date, and the remaining payments for your minimum term, stay payable.' },
    { kind: 'clause', num: '15.3', text: 'You may end this agreement by email if we seriously break it and do not put it right within 30 days of you telling us in writing what is wrong. If you do, no further payments are owed from that date.' },
    { kind: 'clause', num: '15.4', text: 'When the agreement ends, clause 8 decides who owns what. Clauses 3.4, 4.2, 8, 9.1, 11, 12, 13, 15.4 and 16 continue after it ends.' },

    { kind: 'heading', text: '16. GENERAL' },
    { kind: 'clause', num: '16.1', lead: 'Entire agreement.', text: 'This agreement, including Schedule 1, is the entire agreement between us about the service. Our current guarantee terms are those in clause 5.' },
    { kind: 'clause', num: '16.2', lead: 'Events outside our control.', text: 'Neither of us is responsible for delays caused by events outside our reasonable control, such as major outages of the services we rely on.' },
    { kind: 'clause', num: '16.3', lead: 'Transfer.', text: 'We may transfer this agreement to a company or business that takes over Findable, as long as your rights under it are not reduced. You may not transfer it without our written agreement.' },
    { kind: 'clause', num: '16.4', lead: 'Notices.', text: 'Notices must be in writing and may be sent by email to the addresses on page 1 (or a new address either of us notifies).' },
    { kind: 'clause', num: '16.5', lead: 'Severance and waiver.', text: 'If any part of this agreement is found unenforceable, the rest still applies. A delay in enforcing a right is not a waiver of it.' },
    { kind: 'clause', num: '16.6', lead: 'Third parties.', text: 'No one else has any rights under this agreement.' },
    { kind: 'clause', num: '16.7', lead: 'Signing.', text: 'This agreement may be accepted electronically under clause 1.2, or signed on paper or in counterparts. Each way is equally binding.' },
    { kind: 'clause', num: '16.8', lead: 'Law.', text: 'This agreement, and any dispute arising from it, is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.' },
  ],
  schedule: {
    title: 'SCHEDULE 1: WHAT IS INCLUDED',
    columns: ['Findable Build', 'Findable Optimise'],
    rows: [
      ['Website', 'A new website built and managed by us, either a new design or a rebuild of the look you already like', 'Improvements to your existing website, which stays yours and on your hosting'],
      ['Measurement', 'Baseline and re-measurement as in clause 5', 'Baseline and re-measurement as in clause 5'],
      ['Pages and content', 'Clear pages for your real services and genuine service areas, written to be easy for people, search engines and AI to read', 'New and improved pages for your real services and genuine service areas'],
      ['Technical work', 'Crawlability, sitemap, structured data, internal linking, mobile and speed basics', 'Fixes to the same areas where your platform and access allow'],
      ['Listings', 'Your Google Business Profile and relevant directory listings checked and made consistent', 'The same'],
      ['Hosting', 'Included during the term', 'Not included (your own hosting)'],
      ['Ongoing monthly work', 'More pages and improvements, technical monitoring and reasonable changes', 'More pages and improvements and technical monitoring'],
      ['Payments', '12 in total (1 × £99 + 11 × £99 a month)', '6 in total (1 × £99 + 5 × £99 a month)'],
      ['Ownership', 'Passes to you on final payment (clause 8)', 'Your site is always yours; our added work passes to you on final payment (clause 8)'],
    ],
  },
  signatures: {
    title: 'SIGNATURES',
    intro: 'You do not need to sign here if you have accepted electronically under clause 1.2. This page is for anyone who prefers to sign by hand.',
    findableName: 'Paul James Sales, trading as Findable',
  },
};

const VERSIONS: Record<string, AgreementVersion> = { v1: V1 };

export function agreementVersion(version: string = CLIENT_AGREEMENT_VERSION): AgreementVersion {
  const v = VERSIONS[version];
  if (!v) throw new Error(`clientAgreement: unknown version "${version}"`);
  return v;
}

/** Shown verbatim beside the agree button (Paul, 2026-10-02). */
export function agreeConsentSentence(businessName: string): string {
  return `By ticking this box and clicking 'I agree and sign', I confirm that I have read the Findable Client Service Agreement, that I agree to it on behalf of ${businessName}, that I am authorised to do so, and that I intend this to be my electronic signature.`;
}

/** The Stripe Checkout terms text (Paul, 2026-10-02). Stripe renders [text](url) as a link. */
export function checkoutConsentText(agreementUrl: string): string {
  return `I agree to the [Findable Client Service Agreement, including the minimum term](${agreementUrl}).`;
}

/** What gets filled into the agreement. Every field but the business name and route is optional;
 *  an absent one prints NOT_PROVIDED, never a blank box (Paul, 2026-10-02). */
export interface AgreementFill {
  businessName: string;
  route: AgreementRoute;
  legalName?: string | null;
  companyNumber?: string | null;
  contactName?: string | null;
  role?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  websiteDomain?: string | null;
}

export const NOT_PROVIDED = 'Not provided';

const clean = (v: string | null | undefined) => String(v ?? '').replace(/\s+/g, ' ').trim();
const orNot = (v: string | null | undefined) => clean(v) || NOT_PROVIDED;

/** The client-details rows, filled. */
export function clientDetailRows(fill: AgreementFill, v: AgreementVersion = agreementVersion()): Array<[string, string]> {
  const L = v.clientDetailLabels;
  const legal = clean(fill.legalName)
    ? clean(fill.legalName) + (clean(fill.companyNumber) ? ` (company number ${clean(fill.companyNumber)})` : '')
    : NOT_PROVIDED;
  /* "Jane Smith, Director"; a missing half says so rather than leaving a gap. */
  const contact = clean(fill.contactName)
    ? `${clean(fill.contactName)}, ${clean(fill.role) || 'role not provided'}`
    : NOT_PROVIDED;
  return [
    [L.businessName, orNot(fill.businessName)],
    [L.legalName, legal],
    [L.contact, contact],
    [L.address, orNot(fill.address)],
    [L.email, orNot(fill.email)],
    [L.phone, orNot(fill.phone)],
    [L.website, orNot(fill.websiteDomain)],
  ];
}

/* ⛔ THE CANONICAL TEXT — what is hashed and stored as `agreed_text`. Plain text, one block per line,
   in document order, with the client's details and the ticked service filled in. Deterministic: the
   same fill always produces the same bytes, so the fingerprint can be re-checked from the record. */
export function renderAgreementText(fill: AgreementFill, version: string = CLIENT_AGREEMENT_VERSION): string {
  const v = agreementVersion(version);
  const out: string[] = [];
  out.push(`Findable ${CLIENT_AGREEMENT_TITLE} (version ${v.version})`);
  out.push(v.intro);
  out.push('FINDABLE DETAILS');
  for (const [k, val] of v.findableDetails) out.push(`${k}: ${val}`);
  out.push('CLIENT DETAILS');
  for (const [k, val] of clientDetailRows(fill, v)) out.push(`${k}: ${val}`);
  out.push('YOUR SERVICE');
  for (const r of ['build', 'optimise'] as AgreementRoute[]) {
    out.push(`[${fill.route === r ? 'X' : ' '}] ${v.services[r].name}: ${v.services[r].description}`);
  }
  out.push(v.serviceNote);
  for (const b of v.body) {
    if (b.kind === 'heading') out.push(b.text);
    else if (b.kind === 'clause') out.push(`${b.num} ${b.lead ? b.lead + ' ' : ''}${b.text}`);
    else if (b.kind === 'bullet') out.push(`- ${b.text}`);
    else out.push(b.text);
  }
  out.push(v.schedule.title);
  out.push(`| ${v.schedule.columns.join(' | ')}`);
  for (const [label, a, b] of v.schedule.rows) out.push(`${label} | ${a} | ${b}`);
  return out.join('\n');
}

/** SHA-256 of the canonical text, lowercase hex. Web Crypto: the same call in Deno, Node 20+ and the browser. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The version's template text (no client data) — what client_agreement_versions stores. */
export function versionTemplateText(version: string = CLIENT_AGREEMENT_VERSION): string {
  return renderAgreementText({
    businessName: '{{business_name}}', route: 'build',
    legalName: '{{legal_name}}', companyNumber: '{{company_number}}', contactName: '{{contact_name}}', role: '{{role}}',
    address: '{{business_address}}', email: '{{email}}', phone: '{{phone}}', websiteDomain: '{{website_domain}}',
  }, version).replace('[X] Findable Build', '[{{build}}] Findable Build').replace('[ ] Findable Optimise', '[{{optimise}}] Findable Optimise');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE EVIDENCE ROW — the EXACT column names of public.client_agreement_acceptances, as Paul ran them
   (2026-10-02, read back from information_schema the same day). The signer IS the contact: their
   name and role are typed_name / typed_role. For method 'agree_page' the table itself requires
   typed_name, typed_role, legal_business_name, business_address, email and phone (check constraint
   agree_page_is_complete); company_number and website_domain are optional. For 'checkout' it
   requires stripe_session_id (checkout_has_session). Rows can never be updated or deleted.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface AgreementAcceptanceRow {
  lead_id: string;
  business_name: string;
  service_route: AgreementRoute;
  agreement_version: string;
  agreed_text: string;
  agreed_text_sha256: string;
  method: 'checkout' | 'agree_page';
  legal_business_name: string | null;
  company_number: string | null;
  typed_name: string | null;
  typed_role: string | null;
  business_address: string | null;
  email: string | null;
  phone: string | null;
  website_domain: string | null;
  accepted_at?: string;
  ip_address: string | null;
  user_agent: string | null;
  stripe_session_id: string | null;
}

/** The fields the agreement page REQUIRES before it will sign (mirrors agree_page_is_complete). */
export const AGREE_PAGE_REQUIRED = ['legalName', 'contactName', 'role', 'address', 'email', 'phone'] as const;

/** The missing required fields, by fill key. An empty list means the page may sign. */
export function agreePageMissing(fill: AgreementFill): string[] {
  return AGREE_PAGE_REQUIRED.filter((k) => !clean(fill[k]));
}

const orNull = (v: string | null | undefined) => clean(v) || null;

/** Fill → evidence row. The text and fingerprint are passed in (computed once, from renderAgreementText). */
export function acceptanceRowFrom(args: {
  leadId: string; fill: AgreementFill; method: 'checkout' | 'agree_page'; agreedText: string; sha256: string;
  version?: string; ip?: string | null; userAgent?: string | null; stripeSessionId?: string | null;
}): AgreementAcceptanceRow {
  const f = args.fill;
  return {
    lead_id: args.leadId,
    business_name: clean(f.businessName),
    service_route: f.route,
    agreement_version: args.version ?? CLIENT_AGREEMENT_VERSION,
    agreed_text: args.agreedText,
    agreed_text_sha256: args.sha256,
    method: args.method,
    legal_business_name: orNull(f.legalName),
    company_number: orNull(f.companyNumber),
    typed_name: orNull(f.contactName),
    typed_role: orNull(f.role),
    business_address: orNull(f.address),
    email: orNull(f.email),
    phone: orNull(f.phone),
    website_domain: orNull(f.websiteDomain),
    ip_address: orNull(args.ip ?? null),
    user_agent: orNull(args.userAgent ?? null),
    stripe_session_id: orNull(args.stripeSessionId ?? null),
  };
}

/** Evidence row → fill, to re-render the PDF or the "Accepted on … by …" line from the record. */
export function fillFromAcceptanceRow(r: AgreementAcceptanceRow): AgreementFill {
  return {
    businessName: r.business_name, route: r.service_route,
    legalName: r.legal_business_name, companyNumber: r.company_number,
    contactName: r.typed_name, role: r.typed_role,
    address: r.business_address, email: r.email, phone: r.phone, websiteDomain: r.website_domain,
  };
}

/* ⛔ WHERE PAUL'S COPY OF EVERY SIGNED AGREEMENT IS SENT (Paul, 2026-10-02): the canonical Findable
   business email, the same address the agreement prints as "Email for notices". Cloudflare Email
   Routing delivers it onward; that underlying inbox is private infrastructure and is never written
   into code as a recipient. */
export const AGREEMENT_COPY_TO_PAUL = 'paul@findable.live';

/** How an acceptance was made, in words. */
export function methodWords(method: 'checkout' | 'agree_page'): string {
  return method === 'checkout' ? 'checkout' : 'the agreement page';
}

/** UK local date and time, e.g. "2 Oct 2026, 15:04 (UK time)". */
export function ukDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
  return `${date}, ${time} (UK time)`;
}
export function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}
/** "2026-10-02 14:04:09 UTC". */
export function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}
