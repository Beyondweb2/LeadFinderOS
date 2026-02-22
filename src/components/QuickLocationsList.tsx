import { MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Country } from '@/types/lead';

const COUNTRY_DATA: Partial<Record<Country, { flag: string; locations: string[] }>> = {
  UK: {
    flag: '🇬🇧',
    locations: [
      'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool',
      'Bristol', 'Sheffield', 'Edinburgh', 'Newcastle', 'Nottingham', 'Southampton',
      'Leicester', 'Cardiff', 'Belfast', 'Brighton', 'Plymouth', 'Reading',
      'Coventry', 'Hull', 'Stoke-on-Trent', 'Wolverhampton', 'Derby', 'Swansea',
      'Milton Keynes', 'Aberdeen', 'Norwich', 'Oxford', 'Cambridge', 'York',
      'Sunderland', 'Bath', 'Exeter', 'Cheltenham', 'Gloucester', 'Worcester',
      'Ipswich', 'Peterborough', 'Dundee', 'Stirling', 'Inverness', 'Luton',
      'Slough', 'Watford', 'St Albans', 'Guildford', 'Chelmsford', 'Maidstone',
      'Bournemouth', 'Swindon', 'Northampton', 'Warrington', 'Blackpool', 'Preston',
      'Huddersfield', 'Halifax', 'Wakefield', 'Barnsley', 'Doncaster', 'Rotherham',
      'Wigan', 'Bolton', 'Stockport', 'Oldham', 'Rochdale', 'Salford',
      'Chester', 'Shrewsbury', 'Telford', 'Hereford', 'Lincoln', 'Grimsby',
      'Scarborough', 'Harrogate', 'Carlisle', 'Lancaster', 'Burnley', 'Crewe',
      'Stafford', 'Lichfield', 'Tamworth', 'Solihull', 'Dudley', 'Walsall',
      'Redditch', 'Kidderminster', 'Bangor', 'Wrexham', 'Newport', 'Llanelli',
      'Torquay', 'Taunton', 'Yeovil', 'Salisbury', 'Basingstoke', 'Winchester',
      'Eastbourne', 'Hastings', 'Tunbridge Wells', 'Canterbury', 'Margate', 'Dover',
      'Folkestone', 'Ashford', 'Crawley', 'Worthing', 'Chichester', 'Portsmouth',
    ],
  },
  Australia: {
    flag: '🇦🇺',
    locations: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast',
      'Sunshine Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Geelong',
      'Hobart', 'Townsville', 'Cairns', 'Toowoomba', 'Darwin', 'Ballarat',
      'Bendigo', 'Albury', 'Mackay', 'Rockhampton', 'Bundaberg', 'Launceston',
      'Wagga Wagga', 'Tamworth', 'Orange', 'Dubbo', 'Bathurst', 'Lismore',
      'Coffs Harbour', 'Port Macquarie', 'Mildura', 'Shepparton', 'Warrnambool',
      'Gladstone', 'Hervey Bay', 'Mount Isa', 'Geraldton', 'Kalgoorlie',
      'Bunbury', 'Mandurah', 'Alice Springs', 'Devonport', 'Burnie',
    ],
  },
  USA: {
    flag: '🇺🇸',
    locations: [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
      'San Antonio', 'San Diego', 'Dallas', 'Austin', 'San Jose', 'Jacksonville',
      'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver',
      'Boston', 'Nashville', 'Portland', 'Las Vegas', 'Miami', 'Atlanta',
      'Tampa', 'Orlando', 'Minneapolis', 'Cleveland', 'Pittsburgh', 'Cincinnati',
      'Kansas City', 'St Louis', 'Salt Lake City', 'Sacramento', 'Raleigh', 'Richmond',
      'Memphis', 'Louisville', 'Milwaukee', 'Oklahoma City', 'Tucson', 'Albuquerque',
      'Omaha', 'Colorado Springs', 'Boise', 'Tulsa', 'El Paso', 'Fresno',
      'Bakersfield', 'Knoxville', 'Chattanooga', 'Spokane', 'Savannah', 'Charleston',
      'Greenville', 'Lexington', 'Des Moines', 'Madison', 'Little Rock', 'Birmingham',
    ],
  },
  Canada: {
    flag: '🇨🇦',
    locations: [
      'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa',
      'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Victoria',
      'Halifax', 'Oshawa', 'Windsor', 'Saskatoon', 'Regina', 'Barrie',
      'Kelowna', 'Abbotsford', 'St Catharines', 'Guelph', 'Kingston', 'Thunder Bay',
      'Lethbridge', 'Nanaimo', 'Kamloops', 'Red Deer', 'Brantford', 'Moncton',
      'Fredericton', 'Peterborough', 'Chilliwack', 'Prince George', 'Sudbury',
    ],
  },
  Germany: {
    flag: '🇩🇪',
    locations: [
      'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart',
      'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden',
      'Hanover', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld',
      'Bonn', 'Münster', 'Mannheim', 'Karlsruhe', 'Augsburg', 'Wiesbaden',
      'Aachen', 'Freiburg', 'Heidelberg', 'Regensburg', 'Kiel', 'Lübeck',
      'Rostock', 'Mainz', 'Potsdam', 'Wolfsburg', 'Ulm', 'Kassel',
    ],
  },
  France: {
    flag: '🇫🇷',
    locations: [
      'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg',
      'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon',
      'Saint-Étienne', 'Le Havre', 'Grenoble', 'Dijon', 'Angers',
      'Clermont-Ferrand', 'Amiens', 'Limoges', 'Tours', 'Metz', 'Besançon',
      'Perpignan', 'Orléans', 'Rouen', 'Caen', 'Brest', 'Pau',
      'La Rochelle', 'Avignon', 'Cannes', 'Antibes', 'Ajaccio',
    ],
  },
  Spain: {
    flag: '🇪🇸',
    locations: [
      'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga',
      'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba',
      'Valladolid', 'Vigo', 'Gijón', 'Granada', 'Elche', 'Oviedo',
      'Santander', 'Pamplona', 'Toledo', 'Salamanca', 'Burgos', 'Almería',
      'San Sebastián', 'Cádiz', 'Tarragona', 'Marbella', 'Jerez', 'León',
    ],
  },
  Italy: {
    flag: '🇮🇹',
    locations: [
      'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna',
      'Florence', 'Bari', 'Catania', 'Venice', 'Verona', 'Messina', 'Padua',
      'Trieste', 'Brescia', 'Parma', 'Modena',
      'Reggio Calabria', 'Livorno', 'Cagliari', 'Foggia', 'Rimini', 'Perugia',
      'Ravenna', 'Ferrara', 'Bergamo', 'Siracusa', 'Pescara', 'Lecce',
    ],
  },
  Netherlands: {
    flag: '🇳🇱',
    locations: [
      'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Tilburg',
      'Groningen', 'Almere', 'Breda', 'Nijmegen', 'Haarlem', 'Arnhem',
      'Zaanstad', 'Amersfoort', 'Apeldoorn', 'Enschede',
    ],
  },
  Belgium: {
    flag: '🇧🇪',
    locations: [
      'Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges',
      'Namur', 'Leuven', 'Mons', 'Mechelen', 'Aalst', 'Hasselt',
    ],
  },
  Ireland: {
    flag: '🇮🇪',
    locations: [
      'Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Drogheda',
      'Swords', 'Dundalk', 'Bray', 'Navan', 'Ennis', 'Kilkenny',
      'Tralee', 'Carlow', 'Athlone', 'Sligo', 'Wexford', 'Letterkenny',
      'Newbridge', 'Celbridge', 'Mullingar', 'Greystones', 'Tullamore', 'Maynooth',
    ],
  },
  NewZealand: {
    flag: '🇳🇿',
    locations: [
      'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga',
      'Napier-Hastings', 'Dunedin', 'Palmerston North', 'Nelson', 'Rotorua',
      'New Plymouth', 'Whangarei', 'Invercargill', 'Whanganui',
    ],
  },
  SouthAfrica: {
    flag: '🇿🇦',
    locations: [
      'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth',
      'Bloemfontein', 'East London', 'Nelspruit', 'Kimberley', 'Polokwane',
      'Pietermaritzburg', 'Rustenburg', 'George', 'Stellenbosch',
    ],
  },
  India: {
    flag: '🇮🇳',
    locations: [
      'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
      'Ahmedabad', 'Pune', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur',
      'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Vadodara',
    ],
  },
  Singapore: {
    flag: '🇸🇬',
    locations: [
      'Orchard', 'Marina Bay', 'Jurong East', 'Tampines', 'Woodlands',
      'Ang Mo Kio', 'Bedok', 'Clementi', 'Bukit Timah', 'Changi',
    ],
  },
  UAE: {
    flag: '🇦🇪',
    locations: [
      'Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah',
      'Fujairah', 'Umm Al Quwain', 'Dubai Marina', 'Jumeirah',
    ],
  },
  Brazil: {
    flag: '🇧🇷',
    locations: [
      'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza',
      'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre',
      'Belém', 'Goiânia', 'Guarulhos', 'Campinas', 'São Luís',
    ],
  },
  Mexico: {
    flag: '🇲🇽',
    locations: [
      'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana',
      'León', 'Ciudad Juárez', 'Zapopan', 'Mérida', 'San Luis Potosí',
      'Aguascalientes', 'Querétaro', 'Cancún', 'Morelia', 'Chihuahua',
    ],
  },
  Japan: {
    flag: '🇯🇵',
    locations: [
      'Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Kobe', 'Kyoto',
      'Fukuoka', 'Kawasaki', 'Saitama', 'Hiroshima', 'Sendai', 'Chiba',
      'Kitakyushu', 'Sakai', 'Niigata', 'Hamamatsu', 'Shizuoka',
    ],
  },
  Sweden: {
    flag: '🇸🇪',
    locations: [
      'Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro',
      'Linköping', 'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå',
    ],
  },
};

const COUNTRIES = Object.keys(COUNTRY_DATA) as Country[];

interface QuickLocationsListProps {
  onLocationSelect: (location: string, country: Country) => void;
}

export function QuickLocationsList({ onLocationSelect }: QuickLocationsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-walkthrough-step="quick-locations">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className="text-muted-foreground hover:text-foreground w-full justify-start"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Quick Locations
          <ChevronDown
            className={`h-4 w-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <Tabs defaultValue="UK" className="w-full">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex h-auto p-1 mb-3 flex-wrap gap-1">
              {COUNTRIES.map((country) => (
                <TabsTrigger
                  key={country}
                  value={country}
                  className="text-xs px-2 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {COUNTRY_DATA[country]?.flag} {country === 'NewZealand' ? 'NZ' : country === 'SouthAfrica' ? 'SA' : country}
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>
          {COUNTRIES.map((country) => (
            <TabsContent key={country} value={country}>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {COUNTRY_DATA[country]?.locations.map((location) => (
                  <Button
                    key={location}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onLocationSelect(
                        country === 'UK' ? location : `${location}, ${country === 'NewZealand' ? 'New Zealand' : country === 'SouthAfrica' ? 'South Africa' : country}`,
                        country
                      );
                      setIsOpen(false);
                    }}
                    className="text-xs bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
                  >
                    {location}
                  </Button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
