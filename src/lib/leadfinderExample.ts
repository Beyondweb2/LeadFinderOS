/* THE EXAMPLE REPORT (Paul, 2026-11-15): app.leadfinderos.com/r/example, linked from the webdev_example template so a web developer
   can see what their clients would get.
   ⛔ SAMPLE DATA ONLY. The business, the town and every firm named below are made up. The page says "Example report · sample
      data" at the top, on screen and in the PDF. It is built here from fixed rows by the same model and renderer a real report
      uses (reportModel.ts, leadfinderReport.ts), so it always looks like the real thing, but it never reads the database:
      no lead, no audit row, no opens counted (functions/r/[slug].ts answers it before any fetch).
   Pure, relative .ts imports (bundled into the Pages Function). */
import { buildReportModel, type ReportModel } from './reportModel.ts';
import type { OppContext, OppRow } from './reportOpportunity.ts';
import { renderLeadfinderReport } from './leadfinderReport.ts';
import { lfosReportUrl, LFOS_EXAMPLE_SLUG } from './reportBrand.ts';

export const EXAMPLE_SLUG = LFOS_EXAMPLE_SLUG;
export const EXAMPLE_BUSINESS = 'Kingsmere Plumbing & Heating';
const TOWN = 'Kingsmere';
const DATE = '14 Nov 2026';

type Ask = [named: boolean, firms: string[], text?: string];
/* Per search: three asks, each [ChatGPT, Gemini]. */
const DATA: { q: string; asks: [Ask, Ask][] }[] = [
  {
    q: `Who is the best plumber in ${TOWN}?`,
    asks: [
      [[true, [EXAMPLE_BUSINESS, 'Bramley Plumbing', 'Vale Heating Co'], `${EXAMPLE_BUSINESS} is well reviewed for everyday plumbing in ${TOWN}, alongside Bramley Plumbing and Vale Heating Co.`], [true, [EXAMPLE_BUSINESS, 'Bramley Plumbing'], `Popular choices in ${TOWN} include ${EXAMPLE_BUSINESS} and Bramley Plumbing.`]],
      [[true, [EXAMPLE_BUSINESS, 'Ridgeway Plumbers']], [false, ['Bramley Plumbing', 'Ridgeway Plumbers']]],
      [[true, [EXAMPLE_BUSINESS, 'Vale Heating Co']], [true, [EXAMPLE_BUSINESS, 'Bramley Plumbing']]],
    ],
  },
  {
    q: `Who can fix a boiler in ${TOWN}?`,
    asks: [
      [[true, [EXAMPLE_BUSINESS, 'Vale Heating Co'], `For boiler repairs in ${TOWN}, ${EXAMPLE_BUSINESS} and Vale Heating Co are Gas Safe registered and offer same-week visits.`], [false, ['Vale Heating Co', 'Northcote Gas Services']]],
      [[true, [EXAMPLE_BUSINESS, 'Northcote Gas Services']], [true, [EXAMPLE_BUSINESS, 'Vale Heating Co']]],
      [[false, ['Vale Heating Co', 'Hollins Boiler Care']], [true, [EXAMPLE_BUSINESS, 'Vale Heating Co']]],
    ],
  },
  {
    q: `Who is the best emergency plumber in ${TOWN}?`,
    asks: [
      [[false, ['Rapid Response Plumbing', 'Ridgeway Plumbers', 'Kingsmere 24/7 Drains'], `For a 24-hour call-out in ${TOWN}, Rapid Response Plumbing, Ridgeway Plumbers and Kingsmere 24/7 Drains are often mentioned.`], [false, ['Ashcroft Emergency Plumbing', 'Bramley Plumbing'], `Ashcroft Emergency Plumbing and Bramley Plumbing both advertise emergency call-outs in ${TOWN}.`]],
      [[false, ['Millside Plumbing', 'Rapid Response Plumbing']], [false, ['Corner Tap Plumbing', 'Ridgeway Plumbers']]],
      [[false, ['Greenway Plumbing', 'Ashcroft Emergency Plumbing']], [false, ['Oakhill Plumbing', 'Millside Plumbing']]],
    ],
  },
  {
    q: `Who installs bathrooms in ${TOWN}?`,
    asks: [
      [[false, ['Kingsmere Bathroom Studio', 'Fenwick Interiors', 'Ridgeway Plumbers'], `Kingsmere Bathroom Studio and Fenwick Interiors handle full bathroom fits, and Ridgeway Plumbers do smaller refits.`], [false, ['Harbour Bathrooms', 'Fenwick Interiors'], `Harbour Bathrooms and Fenwick Interiors are recommended for bathroom installs in ${TOWN}.`]],
      [[false, ['Stone & Tile Bathrooms', 'Kingsmere Bathroom Studio']], [false, ['Clearwater Bathrooms', 'Abbey Fit Bathrooms']]],
      [[false, ['Harbour Bathrooms', 'Wren Home Renovations']], [false, ['Stone & Tile Bathrooms', 'Mayfield Bathrooms']]],
    ],
  },
  {
    q: `Who is the best heating engineer in ${TOWN}?`,
    asks: [
      [[false, ['Vale Heating Co', 'Northcote Gas Services', 'Hollins Boiler Care'], `Vale Heating Co is the name that comes up most for heating in ${TOWN}, with Northcote Gas Services and Hollins Boiler Care also well rated.`], [false, ['Vale Heating Co', 'Northcote Gas Services'], `Vale Heating Co and Northcote Gas Services are well rated heating engineers in ${TOWN}.`]],
      [[false, ['Vale Heating Co', 'Warmhouse Heating']], [false, ['Northcote Gas Services', 'Bramley Plumbing']]],
      [[false, ['Vale Heating Co', 'Hollins Boiler Care']], [false, ['Warmhouse Heating', 'Northcote Gas Services']]],
    ],
  },
  {
    q: `Who can fix a leaking pipe in ${TOWN}?`,
    asks: [
      [[false, ['Bramley Plumbing', 'Millside Plumbing', 'Corner Tap Plumbing'], `Bramley Plumbing, Millside Plumbing and Corner Tap Plumbing all handle leaks and burst pipes in ${TOWN}.`], [true, [EXAMPLE_BUSINESS, 'Greenway Plumbing'], `${EXAMPLE_BUSINESS} and Greenway Plumbing can usually fix a leak the same day.`]],
      [[false, ['Oakhill Plumbing', 'Ridgeway Plumbers']], [false, ['Greenway Plumbing', 'Ashcroft Emergency Plumbing']]],
      [[false, ['Millside Plumbing', 'Bramley Plumbing']], [false, ['Corner Tap Plumbing', 'Oakhill Plumbing']]],
    ],
  },
];

const cell = ([named, firms, text]: Ask) => ({ named, self_named: named, competitors: firms, citations: [], answer_text: text ?? `${firms.join(', ')}.` });

/** Every stored-answer row of the example: one row per search per ask, the shape a real audit stores. */
export function exampleRows(): OppRow[] {
  return DATA.flatMap((d) => d.asks.map(([c, g]) => ({ question: d.q, result: { chatgpt: cell(c), gemini: cell(g) } })));
}

export function exampleModel(): ReportModel {
  const ctx: OppContext = {
    businessName: EXAMPLE_BUSINESS,
    services: [{ name: 'plumbing', dedicated: true }, { name: 'boiler repair', dedicated: true }, { name: 'emergency plumber', dedicated: false }, { name: 'bathroom installation', dedicated: false }, { name: 'heating engineer', dedicated: false }, { name: 'leak repair', dedicated: false }],
    town: TOWN,
    isNamed: (c: unknown) => !!(c as { named?: boolean })?.named,
  };
  const m = buildReportModel(exampleRows(), ctx, {
    kind: 'opportunity', businessName: EXAMPLE_BUSINESS, town: TOWN, dateLabel: DATE, shareUrl: lfosReportUrl(EXAMPLE_SLUG),
    website: { state: 'issues', issues: [
      { title: 'No page for emergency call-outs, so AI has nothing to quote for that search', serious: true },
      { title: 'The site takes over 6 seconds to load on a phone', serious: true },
      { title: 'Opening hours and service area are not written anywhere on the site', serious: false },
      { title: 'Reviews are not shown on the site', serious: false },
    ] },
  });
  m.signupUrl = null;
  m.what = 'a plumber or heating engineer';
  m.place = `${TOWN}, UK`;
  return m;
}

export function renderLeadfinderExample(opts: { print?: boolean } = {}): string {
  return renderLeadfinderReport(exampleModel(), { print: opts.print, example: true });
}
