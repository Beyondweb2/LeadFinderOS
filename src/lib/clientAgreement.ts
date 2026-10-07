/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINDABLE CLIENT SERVICE AGREEMENT — the ONE copy of its words (Paul, 2026-10-02).

   ⛔ THE WORDING IS PAUL'S, TAKEN VERBATIM: version "v1" from Findable_Client_Service_Agreement.pdf
   (2026-10-02), version "v3" from Findable_Client_Service_Agreement_v3_clean.docx (2026-10-05).
   Do not edit a word of a published version. A change is a NEW version: copy the block, give it a new
   id, and point CLIENT_AGREEMENT_VERSION at it. scripts/client-agreement.test.ts pins v1's fingerprint
   and scripts/client-agreement-v3.test.ts pins v3's, so an edit that forgets to bump fails the gate.
   🔴 v3 IS SIGNED BEFORE PAYMENT, ON THE AGREEMENT PAGE ONLY (its clause 1.2). There is no checkout tick
   under v3: findable-checkout refuses to create a Stripe session until a v3 acceptance exists for THAT
   sign-up (src/lib/signupGate.ts). v1 stays readable so the copies already signed render exactly.

   ⛔ ONE SOURCE, THREE RENDERINGS. The agreement page (client-agreement edge function), the PDF copy
   (agreementPdf.ts) and the evidence fingerprint all read THESE blocks, so what the client saw, what
   they were emailed and what was hashed can never be three different documents.

   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — this module is reached from edge functions.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { REPORT_PUBLIC_ORIGIN } from './findableOffer.ts';

export const CLIENT_AGREEMENT_VERSION = 'v4';

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
  /** A lettered sub-item of the clause above it — "(a) give us, within 7 days…" (v3). */
  | { kind: 'item'; label: string; text: string }
  | { kind: 'note'; text: string };

/** The section titles printed above the details tables. v1 printed the short forms; v3's document
 *  prints its own (e.g. "CLIENT DETAILS (please complete)"). Absent = v1's, so v1's bytes never move. */
export interface AgreementSectionTitles { findable: string; client: string; service: string }
const V1_SECTION_TITLES: AgreementSectionTitles = { findable: 'FINDABLE DETAILS', client: 'CLIENT DETAILS', service: 'YOUR SERVICE' };

export interface AgreementVersion {
  version: string;
  intro: string;
  findableDetails: Array<[string, string]>;
  clientDetailLabels: {
    businessName: string; legalName: string; contact: string; address: string;
    email: string; phone: string; website: string;
  };
  services: Record<AgreementRoute, { name: string; description: string }>;
  /** v1 only: the sentence printed under the two services. */
  serviceNote?: string;
  /** v3: the "KEY POINTS" box printed before clause 1. */
  keyPoints?: { title: string; points: string[] };
  sectionTitles?: AgreementSectionTitles;
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VERSION v3 — Findable_Client_Service_Agreement_v3_clean.docx (Paul, 2026-10-05), VERBATIM.
   Generated from the .docx paragraphs, not retyped: every clause number, bold run-in lead and lettered
   item is the document's own. scripts/fixtures/client-agreement-v3-source.txt is the plain text of that
   .docx and scripts/client-agreement-v3.test.ts proves every paragraph of it appears in
   renderAgreementText(…, 'v3') in order — a single changed word fails the gate.
   What v3 changes against v1, in the words that bind: acceptance is on the agreement page BEFORE
   payment (1.2); the Access Date (5.1); the Results Date and the Refund Window (5.3, 5.4); the Payment
   Start Date is the day after the Refund Window (5.6) with the six-week fallback when the guarantee
   does not apply (5.8); the Continuing Service (FINDABLE_CONTINUING_GBP) after the minimum term (9A).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
const V3: AgreementVersion = {
  version: 'v3',
  intro: 'This agreement covers your Findable service: what we do, what you pay, who owns what, and what happens if either of us wants to stop. Please check your details and accept it before you pay (clause 1.2).',
  findableDetails: V1.findableDetails,
  clientDetailLabels: V1.clientDetailLabels,
  sectionTitles: { findable: 'FINDABLE DETAILS', client: 'CLIENT DETAILS (please complete)', service: 'YOUR SERVICE (tick one)' },
  services: {
    build: { name: 'Findable Build', description: 'We build and manage a new website. £99 initial payment, then £99 a month. 12 payments in total (1 initial + 11 monthly). Then £29.99 a month for hosting and monitoring, until you cancel (clause 9A).' },
    optimise: { name: 'Findable Optimise', description: 'We improve your existing website. £99 initial payment, then £99 a month. 6 payments in total (1 initial + 5 monthly). Then £29.99 a month for monitoring, until you cancel (clause 9A).' },
  },
  keyPoints: {
    title: 'KEY POINTS: please read before you accept',
    points: [
      'Minimum term: 12 payments (Build) or 6 payments (Optimise). If you end early, the remaining payments are still due (clause 4). Monthly payments start the day after your refund window closes (clause 5.6).',
      'Money back guarantee: a refund of your £99 if the number of AI answers naming your business is not higher at the re-measurement (clause 5). We do not otherwise guarantee AI results (clause 6).',
      'After the minimum term, your service continues at £29.99 a month until you cancel with 30 days\' notice (clause 9A). We own the website and our work until you have paid in full (clause 8).',
    ],
  },
  body: [
    { kind: 'heading', text: '1. ABOUT THIS AGREEMENT' },
    { kind: 'clause', num: '1.1', text: 'This agreement is between Paul James Sales, trading as Findable ("Findable", "we", "us") and the business named above ("you").' },
    { kind: 'clause', num: '1.2', text: 'You accept this agreement by clicking "I agree and sign" on your agreement page, which you reach from your onboarding link, before you make your initial payment. This counts as your signature, in the same way as signing on paper.' },
    { kind: 'clause', num: '1.3', text: 'The agreement starts on the date you accept it (the "Start Date"). We keep a record of the version you accepted and will email you a copy of exactly what you agreed to. Please check the details filled in from your onboarding form and tell us straight away if anything is wrong.' },
    { kind: 'clause', num: '1.4', text: 'You confirm you are entering this agreement for your business, not as a private consumer, and that the person accepting or signing has authority to bind the business.' },
    { kind: 'clause', num: '1.5', text: 'Schedule 1 sets out what is included in each service. If anything in Schedule 1 conflicts with the main agreement, the main agreement applies.' },
    { kind: 'heading', text: '2. THE SERVICE' },
    { kind: 'clause', num: '2.1', text: 'We will provide the service you have chosen, as described in Schedule 1, with reasonable skill and care. In short, we measure how often AI search and answer tools (currently ChatGPT and Gemini) name your business, improve your website and public business information so it is clearer and easier for AI systems, and the search systems they draw on, to read and verify, and then measure again. Our reports are not legal, financial or other professional advice.' },
    { kind: 'clause', num: '2.2', text: 'We decide the best way to carry out the work, based on our measurements and experience. We will consult you on anything that changes how your business is described.' },
    { kind: 'clause', num: '2.3', text: 'Anything not listed in Schedule 1 is not included, for example online shops, booking systems, paid advertising, photography, logo design, email hosting or large new features. We are happy to quote for extra work separately.' },
    { kind: 'clause', num: '2.4', text: 'Reasonable website changes during the term are included. We may say no to, or quote separately for, a change that is really a new project.' },
    { kind: 'clause', num: '2.5', lead: 'Checking content.', text: 'We may use software tools, including AI tools, to help prepare content. Before you approve anything or it goes live, you are responsible for checking that what it says about your business, services, prices, service areas, credentials and contact details is accurate. Once you approve it (or it is treated as approved under clause 7.1), you are responsible for its accuracy.' },
    { kind: 'clause', num: '2.6', lead: 'Monthly work.', text: 'Each month during your minimum term, we will review your AI visibility data and make the updates we judge most useful for that month, such as adding new pages, updating existing pages, improving your listings or making technical fixes. The amount and type of work will vary from month to month, depending on what the data shows. We will send you a short monthly update on what we have done.' },
    { kind: 'heading', text: '3. PAYMENTS' },
    { kind: 'clause', num: '3.1', text: 'You pay a £99 initial payment, then £99 a month until the total number of payments for your service has been made (12 for Build, 6 for Optimise, counting the initial payment). Your first monthly payment is taken on the Payment Start Date (clause 5.6). Each later monthly payment is taken on the same date each month as your first monthly payment, or on the last day of the month if that date does not exist in that month. After that, clause 9A applies.' },
    { kind: 'clause', num: '3.2', text: 'You authorise us to take, through our payment provider (currently Stripe), the initial payment, each monthly payment on its due date and, after your minimum term, the Continuing Service payments in clause 9A until you cancel. You agree to keep a valid payment method in place while payments are due. Except under the guarantee in clause 5, or where the law requires, payments are non-refundable.' },
    { kind: 'clause', num: '3.3', text: 'If a payment fails, we will let you know and try again. If a payment is still unpaid 14 days after its due date, we may pause the work and take down the website we built (or, for Findable Optimise, remove the pages and content we added to your website, as clause 8.6 allows) until everything owed is paid. We will tell you before we do this. Taking the site down does not reduce what you owe: the remaining payments for your minimum term must still be paid.' },
    { kind: 'clause', num: '3.4', text: 'If any amount is overdue, we may charge statutory interest and fixed compensation under the Late Payment of Commercial Debts (Interest) Act 1998, plus our reasonable costs of recovering the debt.' },
    { kind: 'clause', num: '3.5', text: 'The price is fixed for your minimum term. We will not increase your monthly payment during the minimum term, except as set out in clause 3.6.' },
    { kind: 'clause', num: '3.6', lead: 'VAT.', text: 'Our prices do not include VAT. Findable is not currently VAT registered, so no VAT is charged. If we become VAT registered, we may add VAT at the applicable rate to payments due after the date of registration, giving you at least 30 days\' notice before the first one. If we do not add it, your payments will not change.' },
    { kind: 'heading', text: '4. YOUR MINIMUM TERM' },
    { kind: 'clause', num: '4.1', text: 'Your service has a minimum term: you agree to make all 12 payments (Build) or all 6 payments (Optimise). This is not a cancel-any-time service.' },
    { kind: 'clause', num: '4.2', text: 'You may end this agreement during your minimum term at any time by email. If you do (other than under the guarantee in clause 5 or because of our serious breach under clause 15.3), the remaining payments for your minimum term stay payable, on their normal dates or, if you prefer, in one go.' },
    { kind: 'clause', num: '4.3', text: 'Ownership of the website and our work only passes to you once every payment for your minimum term has been made (clause 8). If this agreement ends early for any reason other than a guarantee refund under clause 5, and all remaining payments for your minimum term are then paid, ownership passes to you under clause 8.4 when we receive that final payment.' },
    { kind: 'heading', text: '5. MEASUREMENT AND THE GUARANTEE' },
    { kind: 'clause', num: '5.1', lead: 'Access Date.', text: 'The "Access Date" is the date you have given us the access and information we need to start work (clause 7.1(a) and (b)). We will confirm the date to you by email.' },
    { kind: 'clause', num: '5.2', lead: 'Baseline.', text: 'On or shortly after the Access Date, before we make changes, we ask a set of real customer-style questions (currently 20 questions, each asked 3 times, on ChatGPT and Gemini) and count how many answers name your business. The questions are then fixed. We send you the list of questions with your baseline result.' },
    { kind: 'clause', num: '5.3', lead: 'Re-measurement.', text: 'We aim to repeat the measurement about four weeks after the Access Date, using the same questions, the same AI tools and the same method. It may be a little earlier or later depending on the work, but will normally be within six weeks of the Access Date. We do this once, and send you the before and after. The date we send these results is the "Results Date". We may send you progress updates before then, but these are not your results for the guarantee.' },
    { kind: 'clause', num: '5.4', lead: 'The guarantee.', text: 'If the number of answers that name your business at the re-measurement is not higher than at the baseline, you may claim a refund of your £99 initial payment by emailing us no later than 14 days after the Results Date (the "Refund Window").' },
    { kind: 'clause', num: '5.5', text: 'If you make a valid claim, we will refund your £99 initial payment to the card you paid with. This agreement then ends straight away and no further payments are owed. Because the agreement ends before your final payment, the website and our work do not pass to you (clause 8.6).' },
    { kind: 'clause', num: '5.6', lead: 'Payment Start Date.', text: 'Your first monthly payment is taken on the day after your Refund Window ends (the "Payment Start Date"). This is usually about six weeks after the Access Date, depending on when we send your results. No monthly payment is taken while you can still claim a refund. If the guarantee does not apply (clause 5.8), the Payment Start Date is the day after the date six weeks from your initial payment.' },
    { kind: 'clause', num: '5.7', text: 'The guarantee depends on you giving us, and keeping in place, the access, information and approvals we ask for under clause 7. If you are late with approvals after the Access Date, we may move the re-measurement back by the same amount of time.' },
    { kind: 'clause', num: '5.8', text: 'The guarantee does not apply if: (a) you have not given us the access and information we need to start work within 30 days of your initial payment, or you later withdraw access we reasonably need; (b) the website we built cannot lawfully be connected to your domain; (c) a dispute with a third party (for example, a previous web developer, agency or domain owner) stops or delays the work or the website operating; or (d) information you gave us about who owns, or has authority over, your domain, website or listings was wrong.' },
    { kind: 'clause', num: '5.9', text: 'The guarantee in this clause is the only guarantee we give about results. The refunds page on our website (findable.live/refunds) summarises it. If anything there differs from this clause, this clause applies.' },
    { kind: 'heading', text: '6. RESULTS ARE NOT GUARANTEED' },
    { kind: 'clause', num: '6.1', text: 'ChatGPT, Gemini and other AI and search systems (including Google\'s AI features in Search) are run by third parties. We do not control them and cannot see how they decide what to say. They change often, and the same question can get different answers on different days, which is why we ask each question several times when we measure.' },
    { kind: 'clause', num: '6.2', text: 'So, apart from clause 5, we do not promise that any AI tool will name, recommend or cite your business, that you will rank in any position, or that you will get more customers, enquiries or income.' },
    { kind: 'heading', text: '7. WHAT YOU NEED TO DO' },
    { kind: 'clause', num: '7.1', text: 'You agree to:' },
    { kind: 'item', label: '(a)', text: 'give us, within 7 days of us asking, the access we reasonably need: for example to your domain or DNS settings, your existing website, your Google Business Profile and relevant directory listings;' },
    { kind: 'item', label: '(b)', text: 'give us accurate, up-to-date information about your business, services, areas, prices, credentials and contact details, and tell us promptly if anything changes;' },
    { kind: 'item', label: '(c)', text: 'reply to requests for approval within 7 days. If you do not, we may treat the work as approved so it can go live;' },
    { kind: 'item', label: '(d)', text: 'only give us material (text, photos, logos, designs and other content) that you own or have permission to use, and not ask us to publish anything unlawful or misleading; and' },
    { kind: 'item', label: '(e)', text: 'make sure you are allowed to give us access to anything managed by a third party, such as a web agency, and deal with that third party yourself where needed.' },
    { kind: 'clause', num: '7.2', lead: 'Previous developers and agencies.', text: 'Before we start, you must tell us about anyone who has built, hosted or managed your website or domain (for example, a web agency or freelance developer), and about any contract you still have with them. You confirm that using us does not break any contract you have with them (or that you will deal yourself with any notice, fees or other terms that apply), that you control your domain name or will get control of it before we need it, and, for Findable Optimise, that you are allowed to let us change your existing website. We do not advise on your contracts with others, and we will not help you break them. If you are unsure, take independent advice before we start.' },
    { kind: 'clause', num: '7.3', lead: 'If someone objects.', text: 'If anyone claims that our work, or material you gave us, infringes their rights, or that you are not entitled to use us, we may pause the work and take down or remove the disputed material until it is resolved. The guarantee does not apply in that case (clause 5.8(c)), and your payments continue.' },
    { kind: 'clause', num: '7.4', lead: 'Urgent action.', text: 'We may suspend the service, or take down affected content, straight away if we reasonably need to in order to deal with a security problem (for example, a hacked website) or to comply with the law. We will tell you as soon as we can, and restore it once the problem is fixed.' },
    { kind: 'clause', num: '7.5', text: 'We are not responsible for delays, or for any effect on results, caused by you not doing the things in this clause 7.' },
    { kind: 'heading', text: '8. OWNERSHIP AND COPYRIGHT' },
    { kind: 'clause', num: '8.1', lead: 'Your materials stay yours.', text: 'You keep ownership of your domain name, business name, logo, branding, photos and any content you give us ("Your Materials"). You give us permission to use, copy and adapt Your Materials only to provide the service and, where clause 8.9 allows, to show our work.' },
    { kind: 'clause', num: '8.2', lead: 'Our work is ours until you have paid in full.', text: 'We own the copyright and all other intellectual property in everything we create for you, including the website design, code, page layouts, written content, structured data and other materials ("Our Work"), until every payment for your minimum term has been made.' },
    { kind: 'clause', num: '8.3', lead: 'Your licence during the term.', text: 'While your payments are up to date, you have a non-exclusive, non-transferable licence to use Our Work, as part of your website and public business information, for your business.' },
    { kind: 'clause', num: '8.4', lead: 'Ownership passes on final payment.', text: 'When we receive the final payment for your minimum term, we assign to you, to the extent we own it, the copyright in Our Work that was created specifically for you, and we waive any moral rights in it. On request, we will give you a copy of your website files and content within 14 days.' },
    { kind: 'clause', num: '8.5', lead: 'Our tools stay ours.', text: 'Our general tools, templates, code libraries, components, systems (including LeadFinderOS), methods and know-how ("Our Tools") stay ours. On final payment, you get a perpetual, royalty-free licence to use any of Our Tools that form part of your website, as part of that website only. You may transfer this licence only together with the website (for example, if you sell your business). You may not use Our Tools separately from your website or copy them for any other website.' },
    { kind: 'clause', num: '8.6', text: 'If the agreement ends before final payment, for any reason (including a guarantee refund), your licence to use Our Work ends on the same day. We may take down the website we built. For Findable Optimise, you authorise us to remove the pages and content we added, using the access you have given us; if you have withdrawn that access, we will ask you to remove them instead, and you must do so within 14 days. We will not remove or change anything else on your website. You must stop using Our Work. Your Materials and your domain stay yours, and we will return any of Your Materials you ask for. If you later pay all remaining payments, clause 4.3 applies.' },
    { kind: 'clause', num: '8.7', text: 'Third-party materials such as fonts, stock images, plugins and open-source code are used under their own licences, which you must keep to. They are not assigned to you by this agreement.' },
    { kind: 'clause', num: '8.8', lead: 'Your existing website.', text: 'A business often does not own the copyright in a website a developer built for it, unless the developer signed it over in writing. So, unless you show us in writing that you own, or have permission to use, the code, design, text and images of your existing website, we will build from our own templates and write new content, and we will not copy your existing website. If you ask us to keep the look or content of your current website, we will only reuse what you have shown us you are allowed to use, and you confirm you have that permission. We will not copy anyone else\'s website or code.' },
    { kind: 'clause', num: '8.9', lead: 'Showing our work.', text: 'We may name you as a client, show your website in our portfolio, and publish your results or a case study about our work for you. If you would rather we did not, email us at any time and we will stop.' },
    { kind: 'clause', num: '8.10', lead: 'Our methods.', text: 'Our measurement questions, methods, scoring, reports and recommendations are our confidential information (clause 11). You may use them for your own business, but not share them with others or use them to build, or help build, a competing service.' },
    { kind: 'heading', text: '9. DOMAIN AND HOSTING' },
    { kind: 'clause', num: '9.1', lead: 'Your domain name is always yours.', text: 'If we register a new domain for you, it will be registered in your name or transferred to you on request. We will never hold your domain back from you, whatever happens with this agreement.' },
    { kind: 'clause', num: '9.2', lead: 'Findable Build:', text: 'we host the website during the minimum term at no extra cost, and during the Continuing Service as part of the monthly fee (clause 9A). We use reputable hosting providers and take reasonable care to keep the site secure and backed up, but we cannot guarantee it will always be available.' },
    { kind: 'clause', num: '9.3', text: 'When your minimum term ends, your service continues as the Continuing Service under clause 9A, unless you cancel.' },
    { kind: 'clause', num: '9.4', lead: 'Findable Optimise:', text: 'your website stays yours and on your own hosting. We will never take your own website offline. You remain responsible for your hosting, platform, plugins and anything your web agency or other suppliers do to it. We are not responsible for problems caused by changes others make to the site.' },
    { kind: 'heading', text: '9A. CONTINUING SERVICE AFTER THE MINIMUM TERM' },
    { kind: 'clause', num: '9A.1', text: 'When your minimum term ends, your service continues on a rolling monthly basis (the "Continuing Service") at £29.99 a month, taken on the same date as your previous monthly payments, until you cancel.' },
    { kind: 'clause', num: '9A.2', text: 'The Continuing Service includes: for Findable Build, hosting your website, ongoing AI visibility monitoring and reasonable updates to keep your website clear and current for AI tools; for Findable Optimise, ongoing AI visibility monitoring and reasonable updates to your website. It does not include substantial new work, which we can quote for separately.' },
    { kind: 'clause', num: '9A.3', text: 'You can cancel the Continuing Service at any time by email, giving at least 30 days\' notice. We will email you at least 30 days before your minimum term ends to remind you it is about to start and how to cancel. We may change its price by giving you at least 30 days\' notice by email, and you can cancel before the change takes effect.' },
    { kind: 'clause', num: '9A.4', text: 'If you cancel the Continuing Service for Findable Build, we will give you your website files and help you move the website to your own hosting. We will keep your website live on our hosting for 30 days after the Continuing Service ends, so you have time to move it. After that, we may take it down.' },
    { kind: 'clause', num: '9A.5', text: 'Work we create during the Continuing Service becomes yours under clause 8.4 once the month in which we created it has been paid for. The guarantee in clause 5 does not apply to the Continuing Service.' },
    { kind: 'heading', text: '10. LISTINGS, GOOGLE BUSINESS PROFILE AND REVIEWS' },
    { kind: 'clause', num: '10.1', text: 'Your Google Business Profile and directory accounts belong to you. Where you give us access, we will act on your behalf and only make changes that accurately describe your real business, based on the information you give us. You remain responsible for checking listing information is accurate (clause 2.5).' },
    { kind: 'clause', num: '10.2', text: 'Directories, review sites and Google make their own decisions about listings and reviews. We cannot control them.' },
    { kind: 'clause', num: '10.3', text: 'We will never create fake reviews, fake locations or fake listings. You agree to follow the law and each platform\'s rules when asking for reviews (for example, no fake reviews and no offering rewards for reviews).' },
    { kind: 'heading', text: '11. CONFIDENTIALITY' },
    { kind: 'clause', num: '11.1', text: 'Each of us will keep the other\'s confidential information private and only use it for this agreement. This includes login details, business information and our methods, measurements, pricing and systems. It does not cover information that is already public, or that the law requires to be disclosed, and it does not stop us showing our work under clause 8.9.' },
    { kind: 'clause', num: '11.2', text: 'We will keep any login details you give us secure and only use them for the service. You can change them at any time, but if you change or remove our access, please tell us and give us new access. Until you do, we may not be able to continue the work, and the guarantee may not apply (clause 5.8(a)).' },
    { kind: 'heading', text: '12. DATA PROTECTION' },
    { kind: 'clause', num: '12.1', text: 'Each of us will comply with UK data protection law. Our privacy notice explains how we use the personal data of you and your staff.' },
    { kind: 'clause', num: '12.2', text: 'Where we host your website or handle enquiries made through it, we act as your processor for that personal data and you are the controller. When acting as your processor, we will:' },
    { kind: 'item', label: '(a)', text: 'only process the data on your documented instructions, including this agreement;' },
    { kind: 'item', label: '(b)', text: 'make sure anyone handling it is bound by confidentiality;' },
    { kind: 'item', label: '(c)', text: 'keep it secure with appropriate technical and organisational measures;' },
    { kind: 'item', label: '(d)', text: 'only use reputable sub-processors (such as hosting and email providers) bound by equivalent obligations. You give general permission for this; we will tell you before adding or replacing one, and you may object;' },
    { kind: 'item', label: '(e)', text: 'process the data outside the UK only where UK data protection law allows it. You agree that we may access and process the data from outside the UK, including from Thailand where our founder is based, and that some of our providers process data in other countries, in each case using the safeguards UK data protection law requires;' },
    { kind: 'item', label: '(f)', text: 'help you, where reasonable, to respond to people exercising their data rights and to meet your own security and breach obligations;' },
    { kind: 'item', label: '(g)', text: 'tell you without undue delay if we become aware of a breach affecting the data;' },
    { kind: 'item', label: '(h)', text: 'delete or return the data when the service ends, unless the law requires us to keep it; and' },
    { kind: 'item', label: '(i)', text: 'give you the information you reasonably need to show these obligations are being met, and allow reasonable audits, on at least 30 days\' notice, no more than once a year and at your cost, normally by answering a written questionnaire.' },
    { kind: 'clause', num: '12.3', text: 'You are responsible for having a lawful basis for the data collected through your website, and for your own website privacy notice. Websites we build will not use non-essential cookies or tracking unless you ask us to add them; if you do, you are responsible for getting any consent needed.' },
    { kind: 'clause', num: '12.4', text: 'We may occasionally send you information about our other services. You can opt out at any time, including when you accept this agreement, and in every message we send.' },
    { kind: 'heading', text: '13. LIABILITY' },
    { kind: 'clause', num: '13.1', text: 'Nothing in this agreement limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law does not allow to be limited.' },
    { kind: 'clause', num: '13.2', text: 'Neither of us is liable to the other for any indirect or consequential loss, or for loss of profit, income, business, customers or goodwill, including any loss from an AI tool or search engine not naming or ranking you.' },
    { kind: 'clause', num: '13.3', text: 'Our total liability to you under or in connection with this agreement is limited to the total amount you have paid us in the 12 months before the claim.' },
    { kind: 'clause', num: '13.4', text: 'We are not liable for anything caused by AI tools, search engines, directories, payment providers or other third parties outside our reasonable control, or by information or materials you gave us. For hosting, we are responsible for choosing reputable providers and taking reasonable care, but not for outages or failures outside our reasonable control.' },
    { kind: 'clause', num: '13.5', text: 'You will cover our reasonable losses and costs (including reasonable legal costs) if a third party makes a claim against us because: Your Materials, or material you asked us to reuse, infringe their rights; information you gave us was untrue; you were not allowed to give us access to something; or of your contract or dealings with a previous developer, agency or other supplier.' },
    { kind: 'heading', text: '14. CHANGES' },
    { kind: 'clause', num: '14.1', text: 'We may improve our methods, tools and the detail of how we deliver the service over time, as long as the overall service you receive is not reduced.' },
    { kind: 'clause', num: '14.2', text: 'Apart from changes allowed by clauses 3.6 and 9A.3, any other change to this agreement only counts if we both agree it in writing (email is fine).' },
    { kind: 'heading', text: '15. ENDING THE AGREEMENT' },
    { kind: 'clause', num: '15.1', text: 'This agreement continues after your minimum term under clause 9A until it is cancelled, or ends earlier under clauses 4, 5 or this clause 15.' },
    { kind: 'clause', num: '15.2', text: 'We may end this agreement by email if: a payment is more than 14 days overdue and still unpaid 7 days after we remind you; you seriously break this agreement and do not put it right within 14 days of us asking; you become insolvent or stop trading; or you or your staff are abusive or threatening towards us. Any payments due up to that date, and the remaining payments for your minimum term, stay payable. Once all are paid, clause 4.3 applies.' },
    { kind: 'clause', num: '15.3', text: 'You may end this agreement by email if we commit a serious breach of it and do not put it right within 30 days of you telling us in writing what is wrong. A serious breach means one that stops you substantially receiving the service you are paying for, for example if we stop working on your service for more than 30 days in a row for a reason not allowed by this agreement. If you end it under this clause, no further payments are owed from that date.' },
    { kind: 'clause', num: '15.4', text: 'When the agreement ends, clause 8 decides who owns what. Any clause that by its nature is intended to continue after the agreement ends will do so, including clauses 3.4, 4.2, 4.3, 7.3, 8, 9.1, 9A.4, 11, 12, 13 and 16.' },
    { kind: 'heading', text: '16. GENERAL' },
    { kind: 'clause', num: '16.1', lead: 'Entire agreement.', text: 'This agreement, including Schedule 1, is the entire agreement between us about the service. Our current guarantee terms are those in clause 5; our refunds page summarises them, and if it differs, this agreement applies.' },
    { kind: 'clause', num: '16.2', lead: 'What you have relied on.', text: 'You confirm you have not relied on any statement, promise or assurance, including anything said by a Findable salesperson, that is not set out in this agreement. Salespeople cannot change this agreement or agree anything different from it. Nothing in this clause limits liability for fraud.' },
    { kind: 'clause', num: '16.3', lead: 'Complaints.', text: 'If you are unhappy with anything, please email us first. We will reply within 14 days and try to put it right. Both of us will try to resolve a dispute by discussion before going to court.' },
    { kind: 'clause', num: '16.4', lead: 'Events outside our control.', text: 'Neither of us is responsible for delays caused by events outside our reasonable control, such as major outages or changes of the services we rely on, including AI and search providers.' },
    { kind: 'clause', num: '16.5', lead: 'Transfer.', text: 'We may transfer this agreement, including our obligations under it, to a company Paul James Sales controls or to a business that takes over Findable, as long as your rights under it are not reduced. You agree to this now, and will sign anything reasonably needed to complete it. You may not transfer this agreement without our written agreement.' },
    { kind: 'clause', num: '16.6', lead: 'Other terms.', text: 'Notices must be in writing and may be sent by email to the addresses on page 1 (or a new address either of us notifies). If any part of this agreement is found unenforceable, the rest still applies. A delay in enforcing a right is not a waiver of it. No one else has any rights under this agreement. This agreement is accepted electronically under clause 1.2, and that is equally binding as signing on paper.' },
    { kind: 'clause', num: '16.7', lead: 'Law.', text: 'This agreement, and any dispute arising from it, is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.' },
  ],
  schedule: {
    title: 'SCHEDULE 1: WHAT IS INCLUDED',
    columns: ['Findable Build', 'Findable Optimise'],
    rows: [
      ['Website', 'A new website built and managed by us, either a new design or a rebuild of the look you already like (where clause 8.8 allows it)', 'Improvements to your existing website, which stays yours and on your hosting'],
      ['Pages and content', 'Clear pages for your real services and genuine service areas, written to be easy for people, search engines and AI to read', 'New and improved pages for your real services and genuine service areas'],
      ['Technical work', 'Crawlability, sitemap, structured data, internal linking, mobile and speed basics', 'Fixes to the same areas where your platform and access allow'],
      ['Listings', 'Your Google Business Profile and relevant directory listings checked and made consistent', 'The same'],
      ['Hosting', 'Included (clause 9A)', 'Not included (your own hosting)'],
      ['Ongoing monthly work', 'Monthly review and updates (clause 2.6)', 'Monthly review and updates (clause 2.6)'],
    ],
  },
  /* The PDF's signature page only — not part of the agreed text (renderAgreementText never prints it).
     v3 is accepted electronically (clause 1.2); there is no paper route. */
  signatures: {
    title: 'ELECTRONIC SIGNATURE',
    intro: 'Accepted electronically by clicking "I agree and sign" on the agreement page, under clause 1.2.',
    findableName: 'Paul James Sales, trading as Findable',
  },
};

/* ⛔ v4 — Findable_Client_Service_Agreement_v4_clean.docx (Paul, 2026-10-07), generated from the document's
   own text, clause for clause. Do not edit a word of it: a change is a NEW version (v5).
   v4 vs v3: Optimise ends after payment 6 (no automatic £29.99); Build ends after payment 12 and the £29.99
   Hosting and Maintenance is a separate OPT-IN (9A); acceptance is the tick "I have read and agree to the
   Client Service Agreement" plus the authority confirmation, before payment; scored engines are ChatGPT and
   Google AI / Gemini; the guarantee runs to a Results Date + 14-day Refund Window and the monthly starts the
   day after it (5.6); an 8-week re-measurement may apply to a brand-new domain (5.3). */
const V4: AgreementVersion = {
  version: 'v4',
  intro: 'This agreement covers your Findable service: what we do, what you pay, who owns what, the guarantee, and what happens when the service ends. Please check your details and accept it before you pay.',
  findableDetails: V1.findableDetails,
  clientDetailLabels: {
    businessName: 'Business name', legalName: 'Legal name / company number', contact: 'Contact name and role', address: 'Business address',
    email: 'Email for notices', phone: 'Phone', website: 'Website domain (if any)',
  },
  sectionTitles: { findable: 'FINDABLE DETAILS', client: 'CLIENT DETAILS (auto-filled before acceptance)', service: 'YOUR SERVICE (one plan will be selected on your agreement page)' },
  services: {
    build: { name: 'Findable Build', description: 'We build and manage a new website optimised for AI visibility. £99 initial payment, then £99 a month. 12 payments in total (1 initial + 11 monthly). After the minimum term, the service ends unless you separately choose our optional £29.99/month hosting and maintenance service.' },
    optimise: { name: 'Findable Optimise', description: 'We improve your existing website for AI visibility. £99 initial payment, then £99 a month. 6 payments in total (1 initial + 5 monthly). After the sixth payment and final service period, the plan ends. There is no automatic £29.99/month continuation.' },
  },
  keyPoints: {
    title: 'KEY POINTS: please read before you accept',
    points: [
      'Minimum term: 12 payments for Build or 6 payments for Optimise, counting the initial payment. If you end early outside the guarantee or our serious breach, the remaining minimum-term payments stay due.',
      'Money back guarantee: if the number of measured AI answers naming your business is not higher at the guarantee re-measurement, you can claim a refund of your £99 initial payment within 14 days of the Results Date. We do not otherwise guarantee rankings, recommendations, citations, enquiries or income.',
      'Monthly payments start only after the guarantee Refund Window closes, except where the guarantee does not apply under clause 5.8.',
      'Findable Build does not automatically continue after payment 12. Optional hosting and maintenance at £29.99/month only starts if you separately opt in. Findable Optimise ends after payment 6 and has no automatic continuing charge.',
      'For Build, the custom website and our client-specific work transfer to you after all minimum-term payments are made. Your domain, logo, photos, branding and other materials remain yours throughout.',
    ],
  },
  body: [
    { kind: 'heading', text: '1. ABOUT THIS AGREEMENT' },
    { kind: 'clause', num: '1.1', text: 'This agreement is between Paul James Sales, trading as Findable ("Findable", "we", "us") and the business named above ("you").' },
    { kind: 'clause', num: '1.2', text: 'You accept this agreement by clicking "I have read and agree to the Client Service Agreement" and confirming your authority to bind the business on your agreement page, before payment. The acceptance is an electronic signature and is intended to be legally binding in the same way as signing on paper.' },
    { kind: 'clause', num: '1.3', text: 'The agreement starts on the date and time you accept it (the "Start Date"). We keep a record of the agreement version, selected plan, details shown to you and your acceptance timestamp. We will make a copy of the accepted agreement available to you.' },
    { kind: 'clause', num: '1.4', text: 'You confirm you are entering this agreement for your business, not as a private consumer, and that the person accepting has authority to bind that business.' },
    { kind: 'clause', num: '1.5', text: 'Schedule 1 explains what is included in each plan. If Schedule 1 conflicts with the main agreement, the main agreement applies.' },
    { kind: 'heading', text: '2. THE SERVICE' },
    { kind: 'clause', num: '2.1', text: 'We will provide the service you selected with reasonable skill and care. In summary, we run a baseline AI visibility audit, identify realistic customer questions and opportunities, optimise your website so search engines and AI systems can understand the business clearly, create or improve useful pages where appropriate, and measure again using the same approved questions and method.' },
    { kind: 'clause', num: '2.2', text: 'Our current scored engines are ChatGPT and Google AI / Gemini. Platforms and methodology may change over time if needed to keep the service meaningful, but the guarantee comparison will use the same frozen questions and materially the same method as the baseline for that client.' },
    { kind: 'clause', num: '2.3', text: 'We decide the best way to carry out the work based on the measurements, the website, the business information available and our experience. We will consult you before changing material facts about how your business is described.' },
    { kind: 'clause', num: '2.4', text: 'Anything not listed in Schedule 1 is outside the plan, for example online shops, complex booking systems, paid advertising, photography, logo design, email hosting or substantial new software features. We can quote separately for extra work.' },
    { kind: 'clause', num: '2.5', text: 'We may use software tools, including AI tools, to help prepare content and analysis. You are responsible for checking factual information about your business, including services, prices, service areas, credentials and contact details, before publication or promptly when asked to approve it.' },
    { kind: 'clause', num: '2.6', text: 'During the minimum term we will review your AI visibility and the website regularly and make the updates we judge most useful. The amount and type of work will vary depending on what the data shows. We may create or improve pages around genuine services, service areas and customer questions where that is useful and truthful.' },
    { kind: 'clause', num: '2.7', text: 'We may provide monthly tracking or updates during the minimum term. Only the baseline and the guarantee re-measurement described in clause 5 determine the money back guarantee.' },
    { kind: 'heading', text: '3. PAYMENTS' },
    { kind: 'clause', num: '3.1', text: 'You pay a £99 initial payment. Findable Build then has 11 further monthly payments of £99 (12 payments in total, £1,188 in all). Findable Optimise has 5 further monthly payments of £99 (6 payments in total, £594 in all).' },
    { kind: 'clause', num: '3.2', text: 'Your first recurring £99 payment is taken on the Payment Start Date in clause 5.6. Later payments are taken monthly on the same calendar date, or on the last day of the month if that date does not exist.' },
    { kind: 'clause', num: '3.3', text: 'You authorise our payment provider (currently Stripe) to take the initial payment and each payment due during the minimum term. There is no automatic £29.99 continuation for Optimise. Build only continues into the optional hosting and maintenance service in clause 9A if you separately opt in.' },
    { kind: 'clause', num: '3.4', text: 'Except under the guarantee in clause 5, for our serious breach under clause 15.3, or where the law requires otherwise, payments are non-refundable.' },
    { kind: 'clause', num: '3.5', text: 'If a payment fails, we may retry it and will tell you. If it remains unpaid 14 days after its due date, we may pause the service and, for a Build website we host, suspend the site after reasonable written notice until arrears are cleared. Suspension does not by itself cancel minimum-term payments still due.' },
    { kind: 'clause', num: '3.6', text: 'If an amount is overdue, we may charge statutory interest and fixed compensation where the Late Payment of Commercial Debts (Interest) Act 1998 applies, plus reasonable recovery costs.' },
    { kind: 'clause', num: '3.7', text: 'The £99 price is fixed for the minimum term, subject only to VAT. Findable is not currently VAT registered. If we become VAT registered, we may add VAT at the applicable rate to future payments after giving at least 30 days notice.' },
    { kind: 'heading', text: '4. YOUR MINIMUM TERM' },
    { kind: 'clause', num: '4.1', text: 'Build has a minimum term of 12 payments. Optimise has a minimum term of 6 payments. The initial £99 counts as payment 1 in each case. These are not cancel-any-time plans during the minimum term.' },
    { kind: 'clause', num: '4.2', text: 'You may end the agreement during the minimum term by email, but unless you are ending under the guarantee in clause 5 or because of our serious breach under clause 15.3, the remaining minimum-term payments stay payable on their normal dates or, if you prefer, in one payment.' },
    { kind: 'clause', num: '4.3', text: 'For Build, ownership of the custom website and client-specific work transfers only after all 12 minimum-term payments have been made. For Optimise, rights in the client-specific work we create for you transfer after all 6 minimum-term payments have been made, subject to clause 8.' },
    { kind: 'heading', text: '5. MEASUREMENT AND THE GUARANTEE' },
    { kind: 'clause', num: '5.1', text: 'The "Access Date" is the date you have given us the access and information we reasonably need to start substantive work. We will record or confirm that date.' },
    { kind: 'clause', num: '5.2', lead: 'Baseline.', text: 'On or shortly after the Access Date, before material changes are made, we run the approved baseline: currently 20 realistic customer-style questions, each asked 3 times on ChatGPT and Google AI / Gemini. We count how many answers name your business. Once approved, the questions are frozen for the guarantee comparison.' },
    { kind: 'clause', num: '5.3', lead: 'Re-measurement.', text: 'We normally repeat the same measurement about four weeks after the Access Date, using the same frozen questions, the same scored engines and the same method. If we build your website on a brand-new domain, we may use an eight-week re-measurement instead. The date we issue the guarantee results is the "Results Date".' },
    { kind: 'clause', num: '5.4', lead: 'The guarantee.', text: 'If the number of measured answers naming your business is not higher at the guarantee re-measurement than at baseline, you may claim a refund of your £99 initial payment by emailing us no later than 14 days after the Results Date (the "Refund Window"). Any increase, however small, means the guarantee improvement condition has been met.' },
    { kind: 'clause', num: '5.5', text: 'If you make a valid claim, we refund the £99 initial payment, the agreement ends, and no further minimum-term payments are owed. Because the agreement ends before final payment, ownership of Our Work does not transfer under clause 8.' },
    { kind: 'clause', num: '5.6', lead: 'Payment Start Date.', text: 'Your first recurring £99 payment is taken on the day after the Refund Window ends. No recurring £99 payment is taken while the Refund Window is still open. If the guarantee does not apply under clause 5.8 because required access or information was not provided, we may set the Payment Start Date to the day after six weeks from the initial payment and will tell you before charging.' },
    { kind: 'clause', num: '5.7', text: 'The guarantee depends on you giving and keeping in place the access, information and approvals we reasonably need. If you cause delay after the Access Date, we may move the re-measurement and Results Date back by a similar period.' },
    { kind: 'clause', num: '5.8', text: 'The guarantee does not apply if: (a) you do not give us the access and information reasonably needed to start within 30 days of the initial payment, or later withdraw access we reasonably need; (b) a website we build cannot lawfully or technically be connected to the agreed domain because of something outside our reasonable control; (c) a dispute with a previous developer, agency, domain owner or other third party stops or materially delays the work; or (d) information you gave us about ownership, authority, credentials, locations, services or access was materially wrong.' },
    { kind: 'clause', num: '5.9', text: 'The guarantee in this clause is the only guarantee we give about measurable AI visibility results. If any summary elsewhere differs from this clause, this agreement applies.' },
    { kind: 'heading', text: '6. RESULTS ARE NOT GUARANTEED' },
    { kind: 'clause', num: '6.1', text: 'AI systems, search engines, directories and other third-party platforms are outside our control. They change often, and the same question may produce different answers on different runs.' },
    { kind: 'clause', num: '6.2', text: 'Apart from the money back guarantee in clause 5, we do not promise that any AI tool or search engine will name, recommend or cite your business, that you will rank in any particular position, or that you will receive more customers, enquiries, revenue or profit.' },
    { kind: 'heading', text: '7. WHAT YOU NEED TO DO' },
    { kind: 'clause', num: '7.1', text: 'You agree to: (a) give us the access we reasonably need, for example to your domain or DNS, website, Google Business Profile and relevant business listings; (b) give accurate and current information about your business; (c) respond to reasonable approval requests within 7 days; (d) only provide materials you own or have permission to use; and (e) make sure you are entitled to give us access to anything managed by a third party.' },
    { kind: 'clause', num: '7.2', lead: 'Previous developers and agencies.', text: 'You must tell us about any current agency, developer, host or other supplier whose contract or rights may affect the website, domain or our work. You remain responsible for complying with your agreements with them. We do not advise you to break another contract.' },
    { kind: 'clause', num: '7.3', text: 'If someone claims that material you supplied, or work you asked us to reuse, infringes their rights or that you were not entitled to authorise the work, we may pause the affected work or remove disputed material until the issue is resolved.' },
    { kind: 'clause', num: '7.4', text: 'We may take urgent action, including temporary suspension or removal of affected content, where reasonably necessary for security or legal compliance.' },
    { kind: 'clause', num: '7.5', text: 'We are not responsible for delays or resulting effects caused by you not doing what this clause requires.' },
    { kind: 'heading', text: '8. OWNERSHIP AND COPYRIGHT' },
    { kind: 'clause', num: '8.1', lead: 'Your Materials stay yours.', text: 'Your domain, business name, logo, branding, photos, reviews and material you supply remain yours. You give us permission to use and adapt them only to provide the service and, subject to clause 8.9, to show our work.' },
    { kind: 'clause', num: '8.2', text: 'Client-specific work we create remains ours until the final minimum-term payment for the relevant plan has been made. This includes website design, code, page layouts, written content and structured data created specifically for you ("Our Work").' },
    { kind: 'clause', num: '8.3', text: 'While payments are up to date, you have a non-exclusive licence to use Our Work for your business as part of the service.' },
    { kind: 'clause', num: '8.4', text: 'On final payment we assign to you, to the extent we own it, copyright in Our Work created specifically for you. On request we will provide a reasonable export or copy of website files and content where technically practicable.' },
    { kind: 'clause', num: '8.5', text: 'Our reusable tools, templates, code libraries, components, systems, methods and know-how remain ours. Where those tools form part of your website after transfer, you receive a perpetual licence to use them as part of that website, but not to copy them for another product or competing service.' },
    { kind: 'clause', num: '8.6', text: 'If the agreement ends before final payment and the remaining payments are not paid, your licence to use Our Work ends. For Build, we may take down the website we built. For Optimise, your existing website stays yours and we will not take it offline; where reasonably practical we may remove client-specific pages or content we created and still own, without changing the rest of your website.' },
    { kind: 'clause', num: '8.7', text: 'Third-party materials such as fonts, stock images, plugins and open-source software remain subject to their own licences and are not assigned by this agreement.' },
    { kind: 'clause', num: '8.8', lead: 'Existing websites.', text: 'Unless you can show that you own or have permission to reuse the relevant code, design, text and images from an existing website, we may use it as a factual reference but will not copy protected content or code. For Build we may create a new website from our own templates and original content instead.' },
    { kind: 'clause', num: '8.9', text: 'We may name you as a client, show the website in our portfolio and publish factual results or a case study about our work. If you ask us in writing not to do so, we will stop using your business in new promotional material.' },
    { kind: 'clause', num: '8.10', text: 'Our internal measurement questions, scoring methods, reports and non-public recommendations are confidential information. You may use them for your business but must not use or share them to build or help build a competing service.' },
    { kind: 'heading', text: '9. DOMAIN AND HOSTING' },
    { kind: 'clause', num: '9.1', text: 'Your domain name is always yours. If we register a domain for you, we will register it in your name where practicable or transfer it to you on request. We will not hold your domain as leverage for payment.' },
    { kind: 'clause', num: '9.2', lead: 'Build.', text: 'Hosting is included during the 12-payment minimum term. We use reputable providers and take reasonable care with security and backups, but cannot promise uninterrupted availability.' },
    { kind: 'clause', num: '9.3', lead: 'Optimise.', text: 'Your existing website stays on your own hosting and remains your responsibility. We are not responsible for outages, plugin failures or changes made by your host, agency or other suppliers.' },
    { kind: 'heading', text: '9A. OPTIONAL BUILD HOSTING AND MAINTENANCE AFTER PAYMENT 12' },
    { kind: 'clause', num: '9A.1', text: 'This clause applies only to Findable Build. It does not apply to Findable Optimise.' },
    { kind: 'clause', num: '9A.2', text: 'Build does not automatically continue after payment 12. If you want us to keep hosting and reasonably maintaining the website after the minimum term, you may separately opt in to our rolling Hosting and Maintenance service at £29.99 a month.' },
    { kind: 'clause', num: '9A.3', text: 'The optional service includes hosting, reasonable technical maintenance and small routine updates. It does not include substantial redesign, large new features, ongoing AI visibility work or new campaigns unless we agree those separately in writing.' },
    { kind: 'clause', num: '9A.4', text: 'If you opt in, you may cancel the optional service by email with 30 days notice. We may change its price by giving at least 30 days notice, and you may cancel before the change takes effect.' },
    { kind: 'clause', num: '9A.5', text: 'If you do not opt in, or later cancel, we will make the transferred website reasonably available for you to move to your own hosting. We may keep it live on our hosting for up to 30 days after the minimum term or cancellation to allow a reasonable transfer, after which we may take it down if you have not moved it.' },
    { kind: 'heading', text: '10. LISTINGS, GOOGLE BUSINESS PROFILE AND REVIEWS' },
    { kind: 'clause', num: '10.1', text: 'Your Google Business Profile and directory accounts remain yours. Where you give us access, we will only make changes that are intended to describe your real business accurately.' },
    { kind: 'clause', num: '10.2', text: 'Google, directories, review sites and other platforms make their own decisions and we cannot guarantee listings, reviews, rankings or inclusion.' },
    { kind: 'clause', num: '10.3', text: 'We will not create fake reviews, fake locations or fake business profiles. You agree not to ask us to publish false or misleading information or use unlawful review incentives.' },
    { kind: 'heading', text: '11. CONFIDENTIALITY' },
    { kind: 'clause', num: '11.1', text: 'Each of us will keep the other party\'s confidential information private and use it only for this agreement, except where the information is already public or disclosure is required by law.' },
    { kind: 'clause', num: '11.2', text: 'We will keep login details you give us reasonably secure and use them only for the service. If you remove or change access, tell us promptly so we can continue the work.' },
    { kind: 'heading', text: '12. DATA PROTECTION' },
    { kind: 'clause', num: '12.1', text: 'Each of us will comply with applicable UK data protection law. Our privacy notice explains how we use personal data relating to you and your staff.' },
    { kind: 'clause', num: '12.2', text: 'Where we host a website or handle enquiries on your behalf, you are normally the controller and we act as your processor for that personal data. We will process it only on documented instructions, keep it appropriately secure, use suitable sub-processors, assist reasonably with data rights and breach obligations, and delete or return it when the service ends unless law requires retention.' },
    { kind: 'clause', num: '12.3', text: 'You authorise us to use reputable sub-processors and to access or process data outside the UK, including from Thailand where our founder may be based, only where lawful safeguards required by UK data protection law are in place.' },
    { kind: 'clause', num: '12.4', text: 'You are responsible for your own lawful basis, privacy information and consent requirements for personal data collected through your website. Websites we build will not use non-essential cookies or tracking unless agreed and implemented with appropriate consent controls.' },
    { kind: 'clause', num: '12.5', text: 'We may occasionally send you information about our own related services where the law allows. You can opt out at any time.' },
    { kind: 'heading', text: '13. LIABILITY' },
    { kind: 'clause', num: '13.1', text: 'Nothing in this agreement limits liability for death or personal injury caused by negligence, fraud or anything else the law does not allow to be limited.' },
    { kind: 'clause', num: '13.2', text: 'Neither party is liable to the other for indirect or consequential loss, or for loss of profit, income, customers, business or goodwill.' },
    { kind: 'clause', num: '13.3', text: 'Our total liability arising out of or in connection with this agreement is limited to the total amount you paid us in the 12 months before the event giving rise to the claim.' },
    { kind: 'clause', num: '13.4', text: 'We are not liable for failures or changes caused by AI systems, search engines, directories, hosting providers, payment providers or other third parties outside our reasonable control, or by inaccurate information or materials you supplied.' },
    { kind: 'clause', num: '13.5', text: 'You will cover our reasonable losses and costs if a third party claim arises because material you supplied infringed their rights, information you supplied was materially false, you were not entitled to give us access, or because of your separate contract with another developer, agency or supplier.' },
    { kind: 'heading', text: '14. CHANGES' },
    { kind: 'clause', num: '14.1', text: 'We may improve our methods, tools and the detail of delivery over time as long as the overall service is not materially reduced.' },
    { kind: 'clause', num: '14.2', text: 'Any change to this agreement must be agreed in writing, except for VAT changes under clause 3.7 and changes to the optional Build Hosting and Maintenance service allowed by clause 9A.4.' },
    { kind: 'heading', text: '15. ENDING THE AGREEMENT' },
    { kind: 'clause', num: '15.1', text: 'Optimise ends automatically after its sixth payment and final service period. Build ends after its twelfth payment and final service period unless you separately opt in to the optional service in clause 9A.' },
    { kind: 'clause', num: '15.2', text: 'We may end the agreement by email if a payment remains overdue after reasonable written notice, you seriously breach this agreement and do not fix it within 14 days of being asked, you become insolvent or stop trading, or you or your staff are abusive or threatening. Minimum-term amounts already due, and remaining minimum-term payments where clause 4.2 applies, remain payable.' },
    { kind: 'clause', num: '15.3', text: 'You may end the agreement without further minimum-term payments if we commit a serious breach that substantially prevents you receiving the service and do not fix it within 30 days after you tell us in writing what is wrong.' },
    { kind: 'clause', num: '15.4', text: 'When the agreement ends, clause 8 decides ownership. Clauses intended to continue by their nature, including confidentiality, data protection, liability, ownership and payment obligations already accrued, continue to apply.' },
    { kind: 'heading', text: '16. GENERAL' },
    { kind: 'clause', num: '16.1', text: 'This agreement, including Schedule 1, is the entire agreement between us about the service. If a website page or sales summary differs from this agreement, this agreement applies.' },
    { kind: 'clause', num: '16.2', text: 'You confirm you have not relied on a statement or promise that is not included in this agreement. A salesperson cannot change this agreement or agree different commercial terms unless Findable confirms them in writing. Nothing in this clause limits liability for fraud.' },
    { kind: 'clause', num: '16.3', text: 'If you have a complaint, email us first. We will respond within 14 days and both parties will try in good faith to resolve the issue before starting court proceedings.' },
    { kind: 'clause', num: '16.4', text: 'Neither party is responsible for delay caused by events outside its reasonable control, including major outages, security incidents or material changes to third-party AI, search, hosting or payment services.' },
    { kind: 'clause', num: '16.5', text: 'We may transfer this agreement to a company controlled by Paul James Sales or a business that takes over Findable, provided your rights are not materially reduced. You may not transfer this agreement without our written consent.' },
    { kind: 'clause', num: '16.6', text: 'Notices must be in writing and may be sent by email to the addresses recorded for each party. If part of this agreement is unenforceable, the rest continues. Delay in enforcing a right is not a waiver. No third party has rights under this agreement.' },
    { kind: 'clause', num: '16.7', text: 'This agreement and any dispute arising from it are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.' },
  ],
  schedule: {
    title: 'SCHEDULE 1: WHAT IS INCLUDED',
    columns: ['Findable Build', 'Findable Optimise'],
    rows: [
      ['Website', 'A new website built and managed by Findable, designed so people, search engines and AI systems can clearly understand your real services, areas and business.', 'Improvements to your existing website, which remains yours and stays on your own hosting.'],
      ['Baseline', 'Approved AI visibility baseline using frozen customer-style questions.', 'Same.'],
      ['Pages and content', 'Clear, useful pages for genuine services, service areas and real customer questions where appropriate.', 'New or improved pages on the existing site where the platform and access allow.'],
      ['Technical work', 'Crawlability, sitemap, canonicals, internal linking, structured data where appropriate, mobile and performance basics.', 'Fixes to the same areas where your existing platform and access allow.'],
      ['Listings', 'Google Business Profile and relevant legitimate business listings reviewed for consistency where access is provided.', 'Same.'],
      ['Guarantee re-measurement', 'Normally about 4 weeks after Access Date, or 8 weeks where we build on a brand-new domain.', 'Normally about 4 weeks after Access Date.'],
      ['Monthly work during term', 'Regular visibility review and updates guided by what the data shows.', 'Regular visibility review and updates guided by what the data shows.'],
      ['Hosting during term', 'Included for the 12-payment minimum term.', 'Not included. You keep your existing hosting.'],
      ['After minimum term', 'Service ends unless you separately opt in to £29.99/month Hosting and Maintenance.', 'Plan ends after payment 6 and the final service period. No automatic continuing charge.'],
    ],
  },
  /* The PDF's signature page only — not part of the agreed text (renderAgreementText never prints it).
     v4 is accepted electronically on the agreement page (clause 1.2); there is no paper route. */
  signatures: {
    title: 'ELECTRONIC SIGNATURE',
    intro: 'Accepted electronically on the agreement page by agreeing to the Client Service Agreement and confirming authority, under clause 1.2.',
    findableName: 'Paul James Sales, trading as Findable',
  },
};

const VERSIONS: Record<string, AgreementVersion> = { v1: V1, v3: V3, v4: V4 };

export function agreementVersion(version: string = CLIENT_AGREEMENT_VERSION): AgreementVersion {
  const v = VERSIONS[version];
  if (!v) throw new Error(`clientAgreement: unknown version "${version}"`);
  return v;
}

/** Shown verbatim beside the agree button (Paul, 2026-10-02). */
export function agreeConsentSentence(businessName: string, version: string = CLIENT_AGREEMENT_VERSION): string {
  /* v4 clause 1.2: the acceptance IS ticking this exact sentence (with the separate authority confirmation, 1.4). */
  if (version === 'v4') return 'I have read and agree to the Client Service Agreement';
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

/** The section titles a version prints (v1's short forms when it names none). */
export function agreementSectionTitles(v: AgreementVersion): AgreementSectionTitles {
  return v.sectionTitles ?? V1_SECTION_TITLES;
}

/** One body block as one line of the canonical text. */
export function blockText(b: AgreementBlock): string {
  if (b.kind === 'heading') return b.text;
  if (b.kind === 'clause') return `${b.num} ${b.lead ? b.lead + ' ' : ''}${b.text}`;
  if (b.kind === 'bullet') return `- ${b.text}`;
  if (b.kind === 'item') return `${b.label} ${b.text}`;
  return b.text;
}

/* ⛔ THE CANONICAL TEXT — what is hashed and stored as `agreed_text`. Plain text, one block per line,
   in document order, with the client's details and the ticked service filled in. Deterministic: the
   same fill always produces the same bytes, so the fingerprint can be re-checked from the record. */
export function renderAgreementText(fill: AgreementFill, version: string = CLIENT_AGREEMENT_VERSION): string {
  const v = agreementVersion(version);
  const out: string[] = [];
  out.push(`Findable ${CLIENT_AGREEMENT_TITLE} (version ${v.version})`);
  out.push(v.intro);
  const titles = agreementSectionTitles(v);
  out.push(titles.findable);
  for (const [k, val] of v.findableDetails) out.push(`${k}: ${val}`);
  out.push(titles.client);
  for (const [k, val] of clientDetailRows(fill, v)) out.push(`${k}: ${val}`);
  out.push(titles.service);
  for (const r of ['build', 'optimise'] as AgreementRoute[]) {
    out.push(`[${fill.route === r ? 'X' : ' '}] ${v.services[r].name}: ${v.services[r].description}`);
  }
  /* v1 prints its service note here; v3 has none and prints its KEY POINTS instead. v1's bytes are
     unchanged by this branch (its fingerprint is pinned by scripts/client-agreement.test.ts). */
  if (v.serviceNote !== undefined) out.push(v.serviceNote);
  if (v.keyPoints) {
    out.push(v.keyPoints.title);
    for (const p of v.keyPoints.points) out.push(`- ${p}`);
  }
  for (const b of v.body) out.push(blockText(b));
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
  /* ── v3 (migration 20261010090000; required together on a v3 row by v3_acceptance_is_complete) ── */
  /** The sign-up (onboarding_responses row) this signature was given for. Only that sign-up may pay on it. */
  onboarding_id?: string | null;
  /** Clause 1.4 — the separate "I am authorised to bind the business" tick. */
  authority_confirmed?: boolean | null;
  /** Clause 12.4 — "you can opt out … including when you accept this agreement". */
  marketing_opt_out?: boolean | null;
  /** The commercial terms the signature puts the sale on (clientTimeline.ts COMMERCIAL_TERMS_V3). */
  commercial_terms?: string | null;
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
  /** v3 only: the sign-up, the authority tick, the marketing choice and the terms. Omitted keys are not
   *  written, so a v1 row is byte-for-byte what it always was. */
  v3?: { onboardingId: string; authorityConfirmed: boolean; marketingOptOut: boolean; commercialTerms: string };
}): AgreementAcceptanceRow {
  const f = args.fill;
  return {
    ...(args.v3 ? {
      onboarding_id: args.v3.onboardingId,
      authority_confirmed: args.v3.authorityConfirmed === true,
      marketing_opt_out: args.v3.marketingOptOut === true,
      commercial_terms: args.v3.commercialTerms,
    } : {}),
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
