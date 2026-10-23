-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UK TOWNS: SCOTLAND, NORTHERN IRELAND AND LONDON (2026-10-23, feat/find-leads-coverage; docs/find-leads-coverage.md)
-- 109 rows ADDED to the 750 England & Wales Built-Up Areas, same shape, same 12,000+ rule.
-- ADDITIVE AND IDEMPOTENT: insert … on conflict (ons_code) do nothing — no existing row is touched, a re-run adds
-- nothing, and suppressed_at / suppressed_reason are never written (a suppression survives, as with the ONS seed).
--
-- SOURCES (all Open Government Licence v3.0):
--   Scotland  NRS, Population Estimates for Settlements and Localities in Scotland, Mid-2020 (Table 2.1; council
--             areas Table 1.1); points = NRS Settlements2020 population-weighted centroids. Codes S20…
--             "Copyright National Records of Scotland. Contains public sector information licensed under the Open
--             Government Licence v3.0." ⚠️ Mid-2020 ESTIMATES (rounded to 10), not Census 2021: NRS publishes no
--             census-based settlement figures in this form yet.
--   N Ireland NISRA, Census 2021 table CT0100, usual residents by Settlement 2015; points computed from NISRA's
--             Settlements 2015 boundary file. Codes N11… "Source: NISRA : Website: www.nisra.gov.uk"
--   London    ONS Census 2021 TS001 by local authority (Nomis); points = ONS Open Geography Portal LAD Dec 2021.
--             The 32 boroughs, each its own town (London is never worked as one). City of London (8,583) is under
--             12,000 and left out. Codes E09… "Source: Office for National Statistics licensed under the Open
--             Government Licence v.3.0. Contains OS data © Crown copyright and database right 2021."
-- NAMES: the official name, except where it is not the name a business address or a search uses (the in-town rule
-- matches the post town):
--   Greater Glasgow → Glasgow
--   Belfast City → Belfast
--   Derry City → Londonderry
--   Lisburn City → Lisburn
--   Omagh Town → Omagh
--   Craigavon Urban Area including Aghacommon → Craigavon
--   Metropolitan Newtownabbey → Newtownabbey
--   Metropolitan Castlereagh → Castlereagh
--   Bangor → Bangor, County Down
-- JOINED NAMES kept as the source gives them (like England's "Thundersley and South Benfleet"): Aberdeen, Milltimber,
-- and Peterculter; Motherwell and Wishaw; Coatbridge, Airdrie, Chapelhall and Bargeddie; Inverness and Culloden;
-- Bonnyrigg, Dalkeith, Mayfield and Gorebridge; Cumbernauld and Croy; Kirkcaldy and Dysart; Methil, Leven and
-- Buckhaven; Alloa and Sauchie; Cowdenbeath, Lochgelly and Lumphinnans; Montrose, Ferryden and Inchbraoch.
-- ════════════════════════════════════════════════════════════════════════════════════════════

insert into public.uk_towns (ons_code, name, population, region, county, lat, lng) values
  ('S20001766', 'Glasgow', 1028220, 'Scotland', 'East Dunbartonshire; East Renfrewshire; Glasgow City; North Lanarkshire; Renfrewshire; South Lanarkshire; West Dunbartonshire', 55.85365, -4.29479),
  ('S20001714', 'Edinburgh', 530990, 'Scotland', 'City of Edinburgh; East Lothian', 55.94226, -3.20294),
  ('S20001539', 'Aberdeen, Milltimber, and Peterculter', 220690, 'Scotland', 'Aberdeen City', 57.15087, -2.13262),
  ('S20001697', 'Dundee', 158820, 'Scotland', 'Angus; Dundee City; Perth and Kinross', 56.4763, -2.95624),
  ('S20001897', 'Motherwell and Wishaw', 125610, 'Scotland', 'North Lanarkshire', 55.79702, -3.97852),
  ('S20001725', 'Falkirk', 103380, 'Scotland', 'Falkirk', 56.00692, -3.76977),
  ('S20001644', 'Coatbridge, Airdrie, Chapelhall and Bargeddie', 90690, 'Scotland', 'North Lanarkshire', 55.85922, -4.00416),
  ('S20001774', 'Hamilton', 84450, 'Scotland', 'South Lanarkshire', 55.78107, -4.06953),
  ('S20001699', 'Dunfermline', 76210, 'Scotland', 'Fife', 56.06171, -3.42778),
  ('S20001709', 'East Kilbride', 75310, 'Scotland', 'South Lanarkshire', 55.75895, -4.18573),
  ('S20001857', 'Livingston', 65770, 'Scotland', 'West Lothian', 55.88943, -3.52207),
  ('S20001768', 'Greenock', 65690, 'Scotland', 'Inverclyde', 55.9423, -4.75974),
  ('S20001795', 'Inverness and Culloden', 63730, 'Scotland', 'Highland', 57.4702, -4.20952),
  ('S20001574', 'Ayr', 62270, 'Scotland', 'South Ayrshire', 55.46764, -4.61531),
  ('S20001602', 'Bonnyrigg, Dalkeith, Mayfield and Gorebridge', 54940, 'Scotland', 'Midlothian', 55.8709, -3.0715),
  ('S20001666', 'Cumbernauld and Croy', 52420, 'Scotland', 'North Lanarkshire', 55.94932, -3.99855),
  ('S20001809', 'Kilmarnock', 51370, 'Scotland', 'East Ayrshire', 55.60949, -4.49086),
  ('S20001827', 'Kirkcaldy and Dysart', 50370, 'Scotland', 'Fife', 56.124, -3.16858),
  ('S20001992', 'Stirling', 49950, 'Scotland', 'Stirling', 56.11737, -3.93659),
  ('S20001935', 'Perth', 47350, 'Scotland', 'Perth and Kinross', 56.39878, -3.45327),
  ('S20001762', 'Glenrothes', 44760, 'Scotland', 'Fife', 56.19691, -3.17595),
  ('S20001797', 'Irvine', 37580, 'Scotland', 'North Ayrshire', 55.62029, -4.64867),
  ('S20001693', 'Dumfries', 34040, 'Scotland', 'Dumfries and Galloway', 55.07012, -3.61139),
  ('S20001966', 'Saltcoats', 31800, 'Scotland', 'North Ayrshire', 55.64469, -4.78267),
  ('S20001883', 'Methil, Leven and Buckhaven', 30730, 'Scotland', 'Fife', 56.19229, -3.02683),
  ('S20001831', 'Kirkintilloch', 29960, 'Scotland', 'East Dunbartonshire', 55.93356, -4.14287),
  ('S20001587', 'Bathgate', 29330, 'Scotland', 'West Lothian', 55.89568, -3.63008),
  ('S20001601', 'Bonnybridge', 25710, 'Scotland', 'Falkirk', 56.00794, -3.90946),
  ('S20001716', 'Elgin', 25040, 'Scotland', 'Moray', 57.64664, -3.30852),
  ('S20002032', 'Vale of Leven', 24130, 'Scotland', 'West Dunbartonshire', 55.98786, -4.57339),
  ('S20001561', 'Arbroath', 23500, 'Scotland', 'Angus', 56.56419, -2.59029),
  ('S20001692', 'Dumbarton', 21030, 'Scotland', 'West Dunbartonshire', 55.94736, -4.56168),
  ('S20001552', 'Alloa and Sauchie', 20750, 'Scotland', 'Clackmannanshire', 56.12077, -3.79159),
  ('S20001652', 'Cowdenbeath, Lochgelly and Lumphinnans', 19330, 'Scotland', 'Fife', 56.1138, -3.34024),
  ('S20001936', 'Peterhead', 19060, 'Scotland', 'Aberdeenshire', 57.50558, -1.80285),
  ('S20001982', 'St Andrews', 18410, 'Scotland', 'Fife', 56.33486, -2.80381),
  ('S20001721', 'Erskine', 16830, 'Scotland', 'Renfrewshire', 55.89924, -4.45017),
  ('S20001844', 'Larkhall', 16400, 'Scotland', 'South Lanarkshire', 55.73555, -3.96657),
  ('S20001934', 'Penicuik', 16150, 'Scotland', 'Midlothian', 55.83507, -3.22068),
  ('S20001812', 'Kilwinning', 16100, 'Scotland', 'North Ayrshire', 55.6546, -4.70579),
  ('S20001613', 'Broxburn', 15970, 'Scotland', 'West Lothian', 55.93306, -3.4868),
  ('S20001745', 'Galashiels', 15490, 'Scotland', 'Scottish Borders', 55.61409, -2.7966),
  ('S20001778', 'Helensburgh', 15160, 'Scotland', 'Argyll and Bute', 56.00818, -4.73373),
  ('S20002026', 'Troon', 14950, 'Scotland', 'South Ayrshire', 55.55103, -4.64878),
  ('S20001600', 'Bo''ness', 14840, 'Scotland', 'Falkirk', 56.00995, -3.60578),
  ('S20001796', 'Inverurie', 14660, 'Scotland', 'Aberdeenshire', 57.28707, -2.38632),
  ('S20001628', 'Carluke', 14400, 'Scotland', 'South Lanarkshire', 55.7317, -3.83337),
  ('S20001734', 'Forfar', 14120, 'Scotland', 'Angus', 56.64311, -2.88682),
  ('S20001777', 'Hawick', 13620, 'Scotland', 'Scottish Borders', 55.42711, -2.78418),
  ('S20001892', 'Montrose, Ferryden and Inchbraoch', 12950, 'Scotland', 'Angus', 56.71642, -2.46634),
  ('S20001856', 'Linlithgow', 12840, 'Scotland', 'West Lothian', 55.97577, -3.60427),
  ('S20002042', 'Whitburn', 12730, 'Scotland', 'West Lothian', 55.86385, -3.68554),
  ('S20001564', 'Armadale', 12720, 'Scotland', 'West Lothian', 55.89572, -3.69892),
  ('S20001741', 'Fraserburgh', 12570, 'Scotland', 'Aberdeenshire', 57.68629, -2.01971),
  ('S20002041', 'Westhill (Aberdeenshire)', 12110, 'Scotland', 'Aberdeenshire', 57.15499, -2.29501),
  ('N11000151', 'Belfast', 293298, 'Northern Ireland', 'Belfast', 54.59947, -5.92902),
  ('N11000243', 'Londonderry', 85279, 'Northern Ireland', 'Derry City and Strabane', 55.00704, -7.31584),
  ('N11000218', 'Craigavon', 72301, 'Northern Ireland', 'Armagh City, Banbridge and Craigavon', 54.44751, -6.38595),
  ('N11000559', 'Newtownabbey', 67599, 'Northern Ireland', 'Antrim and Newtownabbey', 54.67764, -5.94141),
  ('N11000564', 'Bangor, County Down', 64596, 'Northern Ireland', 'Ards and North Down', 54.65168, -5.66691),
  ('N11000162', 'Castlereagh', 58763, 'Northern Ireland', 'Belfast; Lisburn and Castlereagh', 54.57115, -5.86227),
  ('N11000438', 'Lisburn', 51447, 'Northern Ireland', 'Lisburn and Castlereagh', 54.51373, -6.06012),
  ('N11000447', 'Metropolitan Lisburn', 32643, 'Northern Ireland', 'Belfast; Lisburn and Castlereagh', 54.5549, -6.02135),
  ('N11000099', 'Ballymena', 31205, 'Northern Ireland', 'Mid and East Antrim', 54.86361, -6.27849),
  ('N11000040', 'Newtownards', 29677, 'Northern Ireland', 'Ards and North Down', 54.59469, -5.68871),
  ('N11000537', 'Newry', 28530, 'Northern Ireland', 'Newry, Mourne and Down', 54.1801, -6.34195),
  ('N11000153', 'Carrickfergus', 28141, 'Northern Ireland', 'Mid and East Antrim', 54.72536, -5.80077),
  ('N11000001', 'Antrim', 25606, 'Northern Ireland', 'Antrim and Newtownabbey', 54.71875, -6.20769),
  ('N11000173', 'Coleraine', 24483, 'Northern Ireland', 'Causeway Coast and Glens', 55.13233, -6.666),
  ('N11000603', 'Omagh', 20458, 'Northern Ireland', 'Fermanagh and Omagh', 54.60147, -7.29448),
  ('N11000389', 'Larne', 18853, 'Northern Ireland', 'Mid and East Antrim', 54.85508, -5.82834),
  ('N11000131', 'Banbridge', 17400, 'Northern Ireland', 'Armagh City, Banbridge and Craigavon', 54.34743, -6.27221),
  ('N11000051', 'Armagh', 16310, 'Northern Ireland', 'Armagh City, Banbridge and Craigavon', 54.34773, -6.64983),
  ('N11000315', 'Dungannon', 16282, 'Northern Ireland', 'Mid Ulster', 54.50351, -6.76253),
  ('N11000346', 'Enniskillen', 14086, 'Northern Ireland', 'Fermanagh and Omagh', 54.34772, -7.63397),
  ('N11000638', 'Strabane', 13507, 'Northern Ireland', 'Derry City and Strabane', 54.82136, -7.4649),
  ('N11000193', 'Cookstown', 12546, 'Northern Ireland', 'Mid Ulster', 54.64208, -6.74814),
  ('E09000008', 'Croydon', 390719, 'London', 'Greater London', 51.36597, -0.07761),
  ('E09000003', 'Barnet', 389344, 'London', 'Greater London', 51.61107, -0.21819),
  ('E09000009', 'Ealing', 367115, 'London', 'Greater London', 51.52442, -0.3141),
  ('E09000025', 'Newham', 351036, 'London', 'Greater London', 51.53149, 0.02726),
  ('E09000005', 'Brent', 339816, 'London', 'Greater London', 51.56438, -0.27568),
  ('E09000006', 'Bromley', 329992, 'London', 'Greater London', 51.37266, 0.03925),
  ('E09000010', 'Enfield', 329984, 'London', 'Greater London', 51.64889, -0.08144),
  ('E09000032', 'Wandsworth', 327506, 'London', 'Greater London', 51.4524, -0.20021),
  ('E09000022', 'Lambeth', 317654, 'London', 'Greater London', 51.46445, -0.11385),
  ('E09000030', 'Tower Hamlets', 310306, 'London', 'Greater London', 51.51554, -0.03647),
  ('E09000026', 'Redbridge', 310260, 'London', 'Greater London', 51.58588, 0.07008),
  ('E09000028', 'Southwark', 307637, 'London', 'Greater London', 51.46594, -0.07308),
  ('E09000017', 'Hillingdon', 305909, 'London', 'Greater London', 51.53664, -0.44182),
  ('E09000023', 'Lewisham', 300553, 'London', 'Greater London', 51.4423, -0.01734),
  ('E09000011', 'Greenwich', 289068, 'London', 'Greater London', 51.46394, 0.05009),
  ('E09000018', 'Hounslow', 288181, 'London', 'Greater London', 51.46238, -0.37855),
  ('E09000031', 'Waltham Forest', 278426, 'London', 'Greater London', 51.59461, -0.0188),
  ('E09000014', 'Haringey', 264238, 'London', 'Greater London', 51.58771, -0.1067),
  ('E09000016', 'Havering', 262052, 'London', 'Greater London', 51.56519, 0.23537),
  ('E09000015', 'Harrow', 261203, 'London', 'Greater London', 51.59467, -0.33598),
  ('E09000012', 'Hackney', 259146, 'London', 'Greater London', 51.55492, -0.06045),
  ('E09000004', 'Bexley', 246472, 'London', 'Greater London', 51.45822, 0.14621),
  ('E09000002', 'Barking and Dagenham', 218869, 'London', 'Greater London', 51.54555, 0.12948),
  ('E09000019', 'Islington', 216589, 'London', 'Greater London', 51.54546, -0.10989),
  ('E09000024', 'Merton', 215186, 'London', 'Greater London', 51.41058, -0.18868),
  ('E09000007', 'Camden', 210136, 'London', 'Greater London', 51.54305, -0.16291),
  ('E09000029', 'Sutton', 209639, 'London', 'Greater London', 51.35755, -0.17226),
  ('E09000033', 'Westminster', 204236, 'London', 'Greater London', 51.51221, -0.15295),
  ('E09000027', 'Richmond upon Thames', 195278, 'London', 'Greater London', 51.44035, -0.28914),
  ('E09000013', 'Hammersmith and Fulham', 183157, 'London', 'Greater London', 51.48733, -0.21735),
  ('E09000021', 'Kingston upon Thames', 168063, 'London', 'Greater London', 51.39296, -0.28367),
  ('E09000020', 'Kensington and Chelsea', 143375, 'London', 'Greater London', 51.49648, -0.18977)
on conflict (ons_code) do nothing;
