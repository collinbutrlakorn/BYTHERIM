// ============================================================
// Procedural roster generation — no DOM. Testable in Node.
// Fills out the full 365-team D1 universe: real curated recruits/roster
// players (from the Google Sheets) are always used as-is, and whatever's
// missing — a few bench spots, or an entire roster for a team with no
// real data yet — gets generated so every team is playable.
// ============================================================

// ---------- names ----------
//
// A generated player's name has to fit where he's from. Where he's from
// is decided first (an American hometown, or one of the countries that
// actually send players to Division I), and the name is drawn from that
// place's pools. Lists are ordered roughly from most to least common and
// drawn with a lean toward the front, so ordinary names dominate the way
// they do on real rosters. Nothing here is a famous player's name.

// First names for American players, broadly common among young American
// men and on American basketball rosters.
const US_FIRST = [
  'Jalen','Isaiah','Elijah','Jordan','Cameron','Caleb','Christian','Michael','Marcus','Josiah',
  'Chris','Justin','Brandon','Tyler','Jayden','Malik','Darius','Devin','Anthony','Josh',
  'Joshua','Kevin','Ryan','Aaron','Andrew','Nathan','Noah','Ethan','Jaylen','Xavier',
  'Jaden','Tyrese','Deandre','Andre','Trey','Jamal','Terrence','Amari','Kameron','Keon',
  'Kendall','Bryce','Evan','Isaac','Julian','Gabriel','Daniel','David','Matthew','James',
  'John','Jacob','Mason','Carter','Dominic','Donovan','Derrick','Dylan','Logan','Luke',
  'Cole','Drew','Chase','Grant','Blake','Tristan','Landon','Micah','Miles','Myles',
  'Omari','Quincy','Reggie','Rashad','Corey','Darnell','Dante','Demetrius','Desmond','Elias',
  'Emmanuel','Ian','Jerome','Jonah','Khalil','Lamar','Marcel','Maurice','Nasir','Quentin',
  'Shawn','Terrell','Travis','Troy','Wesley','Kenneth','Bryson','Camden','Colby','Denzel',
  'Tre','Kobe','Jaylon','Jahmir','Zaire','Jermaine','Tyrell','Cedric','Marquis','Alex'
];
// Paired with the European-heritage surnames below, which in practice come
// with these more than with the full list.
const US_FIRST_CLASSIC = [
  'Jack','Luke','Cole','Tyler','Ryan','Connor','Drew','Owen','Nick','Matt',
  'Brady','Tanner','Kyle','Evan','Ben','Sam','Jake','Logan','Carter','Hunter',
  'Grant','Blake','Chase','Mason','Ethan','Noah','Caleb','Michael','Andrew','Jacob',
  'Zach','Dylan','Alex','Max','Trevor','Brendan','Sean','Liam','Aiden','Gavin','Colin','Will'
];
// Most common American surnames, roughly in census order (Hispanic
// surnames are kept separately so their share can follow geography).
const US_LAST = [
  'Smith','Johnson','Williams','Brown','Jones','Davis','Miller','Wilson','Moore','Taylor',
  'Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Robinson','Clark','Lewis',
  'Walker','Hall','Allen','Young','King','Wright','Scott','Green','Baker','Adams',
  'Nelson','Hill','Campbell','Mitchell','Roberts','Carter','Phillips','Evans','Turner','Parker',
  'Collins','Edwards','Stewart','Morris','Murphy','Cook','Rogers','Morgan','Cooper','Peterson',
  'Reed','Bailey','Bell','Kelly','Howard','Ward','Cox','Richardson','Wood','Watson',
  'Brooks','Bennett','Gray','James','Hughes','Price','Sanders','Myers','Long','Ross',
  'Foster','Powell','Jenkins','Perry','Russell','Sullivan','Butler','Barnes','Fisher','Henderson',
  'Coleman','Simmons','Patterson','Jordan','Reynolds','Hamilton','Graham','Wallace','Woods','Cole',
  'West','Owens','Marshall','Ellis','Harrison','Gibson','McDonald','Murray','Freeman','Wells',
  'Webb','Simpson','Stevens','Tucker','Porter','Hunter','Hicks','Crawford','Henry','Boyd',
  'Mason','Kennedy','Warren','Dixon','Burns','Gordon','Shaw','Holmes','Rice','Robertson',
  'Hunt','Black','Daniels','Palmer','Mills','Nichols','Grant','Knight','Ferguson','Stone',
  'Hawkins','Dunn','Perkins','Hudson','Spencer','Gardner','Stephens','Payne','Pierce','Berry',
  'Matthews','Arnold','Willis','Ray','Watkins','Carroll','Duncan','Hart','Cunningham','Bradley',
  'Lane','Andrews','Harper','Fox','Riley','Armstrong','Weaver','Greene','Lawrence','Elliott',
  'Sims','Austin','Franklin','Lawson','Fields','Carr','Williamson','Howell','Jefferson','Washington',
  'Banks','Bishop','Walton','Mack','Tate','Glover','Moss','Horton'
];
const US_LAST_SOUTH = [
  'Washington','Jefferson','Banks','Holloway','Gaines','McCoy','Tillman','Pruitt','Bullock','Singleton',
  'Mayfield','Battle','Toney','Glover','Horton','McKinney','Pittman','Lockett','Dorsey','Sheppard',
  'Hairston','Bryant','Rhodes','Whitfield','Mims','Odom','Council','Staten','Blackmon','Gatewood'
];
const US_LAST_NORTHEAST = [
  'Murphy','Sullivan','O\'Brien','Kelly','Walsh','Ryan','Fitzgerald','McCarthy','Doyle','Byrne',
  'Romano','Russo','DeLuca','Esposito','Marino','Rossi','Caruso','Gallo','Rizzo','Costa',
  'Nolan','Brennan','Keane','Donovan','Quinn','Gallagher'
];
const US_LAST_MIDWEST = [
  'Schmidt','Mueller','Schneider','Becker','Hoffman','Wagner','Koch','Klein','Kowalski','Nowak',
  'Wojcik','Lewandowski','Olson','Larson','Swanson','Hanson','Lindgren','Meyer','Weber','Kraus',
  'Novak','Zimmerman','Schultz','Krueger','Brandt'
];
const US_LAST_MOUNTAIN = [
  'Jensen','Christensen','Larsen','Hansen','Nielsen','Petersen','Olsen','Madsen','Sorensen','Andersen',
  'Pratt','Hatch','Call','Rowley','Bingham'
];
const US_LAST_HISPANIC = [
  'Garcia','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Perez','Sanchez','Ramirez','Torres',
  'Flores','Rivera','Gomez','Diaz','Reyes','Cruz','Morales','Ortiz','Gutierrez','Chavez',
  'Ramos','Ruiz','Mendoza','Alvarez','Castillo','Jimenez','Vasquez','Romero','Herrera','Medina',
  'Aguilar','Vargas','Castro','Guerrero','Fernandez','Delgado','Soto','Salazar'
];
const US_FIRST_HISPANIC = [
  'Adrian','Angel','Daniel','Diego','Gabriel','Isaac','Javier','Jose','Juan','Luis',
  'Mateo','Miguel','Julian','Alejandro','Carlos','Eric','Victor','Marco','Andres','Nico',
  'Rafael','Sebastian','Christian','Santiago','Ivan','Oscar','Josue','Emilio','Joel','Elijah'
];

// Share of an American player's surname drawn from a regional pool, by
// the state he's from.
const HISPANIC_SHARE = { TX: 0.24, CA: 0.24, AZ: 0.22, NM: 0.30, FL: 0.16, NV: 0.16, CO: 0.14 };
const STATE_REGION_NAMES = {
  'South': ['AL','GA','SC','NC','TN','MS','LA','AR','KY','VA','WV','MD','DC','OK','TX','FL'],
  'Northeast': ['NY','NJ','PA','MA','CT','RI','NH','VT','ME','DE'],
  'Midwest': ['IL','IN','MI','OH','WI','MN','IA','NE','KS','ND','SD','MO'],
  'Mountain': ['UT','ID','MT','WY']
};
const REGIONAL_LAST = { South: US_LAST_SOUTH, Northeast: US_LAST_NORTHEAST, Midwest: US_LAST_MIDWEST, Mountain: US_LAST_MOUNTAIN };

// Countries that send players to Division I, weighted roughly by how many
// they send. Each has its own cities and name pools, so a name always
// matches its country.
const INTERNATIONAL = [
  { w: 14, country: 'Canada', cities: ['Toronto, ON','Mississauga, ON','Brampton, ON','Hamilton, ON','Ottawa, ON','Montreal, QC','Vancouver, BC','Calgary, AB','Edmonton, AB','Winnipeg, MB'],
    first: null, last: null },   // Canadian names follow the American pools
  { w: 11, country: 'Nigeria', cities: ['Lagos','Abuja','Ibadan','Kano','Port Harcourt','Enugu','Benin City'],
    first: ['Chinedu','Emeka','Ifeanyi','Obinna','Chukwuemeka','Tobi','Tunde','Femi','Seun','Ayo','Kelechi','Uche','Samuel','David','Daniel','Victor','Michael','Joshua','Ikenna','Oluwaseun'],
    last: ['Okafor','Okoro','Eze','Nwosu','Okeke','Adeyemi','Balogun','Ogunleye','Adeleke','Ibrahim','Bello','Nnamdi','Obi','Onyeka','Uzoma','Afolabi','Ogbonna','Chukwu','Olatunji','Akinola'] },
  { w: 8, country: 'Australia', cities: ['Melbourne, AUS','Sydney, AUS','Perth, AUS','Brisbane, AUS','Adelaide, AUS','Canberra, AUS'],
    first: ['Jack','Liam','Josh','Lachlan','Mitchell','Cooper','Harry','Oliver','Tom','Sam','Will','Riley','Jake','Ben','Angus','Hamish','Bailey','Nathan','Luke','Kai'],
    last: ['Smith','Jones','Williams','Brown','Wilson','Taylor','Johnson','White','Martin','Anderson','Thompson','Walker','Kelly','Ryan','Campbell','Harris','Clarke','O\'Brien','Mitchell','Murphy','Hughes','Cooper'] },
  { w: 6, country: 'Serbia', cities: ['Belgrade','Novi Sad','Nis','Kragujevac'],
    first: ['Nikola','Stefan','Marko','Luka','Filip','Aleksa','Lazar','Milos','Uros','Nemanja','Vuk','Dusan','Strahinja','Ognjen'],
    last: ['Jovanovic','Petrovic','Nikolic','Markovic','Djordjevic','Stojanovic','Ilic','Pavlovic','Popovic','Stankovic','Kostic','Radovanovic','Lazic','Todorovic'] },
  { w: 6, country: 'France', cities: ['Paris','Lyon','Marseille','Lille','Bordeaux','Nantes','Strasbourg','Toulouse'],
    first: ['Hugo','Lucas','Theo','Enzo','Nathan','Mathis','Louis','Tom','Maxime','Antoine','Clement','Axel','Yanis','Bastien','Quentin','Noah'],
    last: ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Fontaine','Rousseau','Girard','Bonnet','Lambert'] },
  { w: 5, country: 'Germany', cities: ['Berlin','Munich','Hamburg','Cologne','Frankfurt','Bonn','Ulm','Bamberg'],
    first: ['Lukas','Leon','Jonas','Felix','Paul','Luca','Niklas','Finn','Tim','Jan','Moritz','Maximilian','Julian','Tobias'],
    last: ['Muller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Koch','Richter','Klein','Wolf','Neumann','Braun','Zimmermann'] },
  { w: 5, country: 'Senegal', cities: ['Dakar','Thies','Saint-Louis','Rufisque'],
    first: ['Mamadou','Moussa','Cheikh','Abdoulaye','Ibrahima','Ousmane','Babacar','Modou','Pape','Serigne','Aliou','Amadou'],
    last: ['Diop','Ndiaye','Fall','Sarr','Diallo','Faye','Gueye','Sow','Ba','Sy','Mbaye','Seck','Niang','Cisse'] },
  { w: 4, country: 'Lithuania', cities: ['Vilnius','Kaunas','Klaipeda','Siauliai'],
    first: ['Lukas','Matas','Nojus','Dominykas','Mantas','Tomas','Rokas','Karolis','Deividas','Arnas','Ignas','Paulius'],
    last: ['Kazlauskas','Jankauskas','Petrauskas','Stankevicius','Vasiliauskas','Zukauskas','Butkus','Paulauskas','Urbonas','Navickas','Kavaliauskas','Rimkus'] },
  { w: 4, country: 'Spain', cities: ['Madrid','Barcelona','Valencia','Seville','Malaga','Bilbao','Zaragoza'],
    first: ['Pablo','Alejandro','Hugo','Daniel','Alvaro','Adrian','Mario','Sergio','Javier','Marcos','Carlos','Diego','Jorge','Ivan','Ruben'],
    last: ['Garcia','Fernandez','Gonzalez','Rodriguez','Lopez','Martinez','Sanchez','Perez','Martin','Gomez','Ruiz','Diaz','Moreno','Alonso','Navarro','Torres'] },
  { w: 4, country: 'Cameroon', cities: ['Yaounde','Douala','Bafoussam'],
    first: ['Jean','Joel','Christian','Franck','Yannick','Brice','Serge','Arnaud','Steve','Paul'],
    last: ['Mbarga','Ngono','Essomba','Fotso','Kamga','Tchatchoua','Nkodo','Atangana','Owona','Mbida'] },
  { w: 3, country: 'Croatia', cities: ['Zagreb','Split','Rijeka','Zadar'],
    first: ['Ivan','Luka','Marko','Josip','Ante','Mateo','Karlo','Filip','Dominik','Toni'],
    last: ['Horvat','Kovacevic','Babic','Maric','Juric','Novak','Kovacic','Knezevic','Vukovic','Pavic','Bozic','Blazevic'] },
  { w: 3, country: 'Mali', cities: ['Bamako','Sikasso','Segou'],
    first: ['Mamadou','Moussa','Seydou','Boubacar','Adama','Souleymane','Ibrahim','Oumar','Sekou','Bakary'],
    last: ['Traore','Keita','Coulibaly','Diarra','Konate','Sissoko','Toure','Camara','Doumbia','Kante'] },
  { w: 3, country: 'South Sudan', cities: ['Juba','Wau','Malakal'],
    first: ['Majok','Garang','Akol','Mabior','Chol','Kuol','Makur','Nyang','Peter','John','Gabriel','Deng'],
    last: ['Mayen','Akec','Garang','Mabil','Makuach','Kuany','Ajak','Marial','Chol','Aguer','Lual','Majak'] },
  { w: 3, country: 'Dominican Republic', cities: ['Santo Domingo','Santiago','San Pedro de Macoris','La Romana'],
    first: ['Luis','Jose','Juan','Angel','Carlos','Jean','Miguel','Victor','Eddy','Yeison','Wilmer','Anthony'],
    last: ['Rodriguez','Perez','Martinez','Garcia','Santana','Reyes','Pena','Ramirez','De Leon','Mejia','Almonte','Batista','Castillo','Rosario','Tavarez'] },
  { w: 2, country: 'Puerto Rico', cities: ['San Juan, PR','Bayamon, PR','Carolina, PR','Ponce, PR','Caguas, PR'],
    first: ['Jose','Luis','Carlos','Angel','Xavier','Christian','Javier','Joel','Gabriel','Yadiel','Adrian','Jan'],
    last: ['Rivera','Rodriguez','Santiago','Colon','Vazquez','Torres','Ortiz','Cruz','Ramos','Diaz','Morales','Maldonado','Figueroa','Velez','Negron','Melendez'] },
  { w: 2, country: 'Slovenia', cities: ['Ljubljana','Maribor','Celje'],
    first: ['Luka','Jan','Nejc','Ziga','Matic','Tilen','Rok','Jaka','Anze'],
    last: ['Novak','Horvat','Krajnc','Zupancic','Kovacic','Potocnik','Mlakar','Vidmar','Kos','Golob'] },
  { w: 2, country: 'Latvia', cities: ['Riga','Liepaja','Daugavpils'],
    first: ['Rihards','Janis','Martins','Davis','Roberts','Arturs','Edgars','Kristers','Rolands'],
    last: ['Berzins','Kalnins','Ozolins','Jansons','Liepins','Krumins','Vitols','Zarins'] },
  { w: 2, country: 'Italy', cities: ['Rome','Milan','Bologna','Turin','Naples','Florence'],
    first: ['Lorenzo','Matteo','Leonardo','Francesco','Alessandro','Andrea','Riccardo','Tommaso','Gabriele','Marco','Davide','Luca'],
    last: ['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','Mancini','Costa'] },
  { w: 2, country: 'Greece', cities: ['Athens','Thessaloniki','Patras'],
    first: ['Giorgos','Nikos','Dimitris','Kostas','Alexandros','Panagiotis','Christos','Vasilis','Stavros','Thanasis'],
    last: ['Papadopoulos','Pappas','Georgiou','Oikonomou','Nikolaidis','Dimitriou','Karagiannis','Vlachos','Makris','Christodoulou','Konstantinou','Alexiou'] },
  { w: 2, country: 'Turkey', cities: ['Istanbul','Ankara','Izmir','Bursa'],
    first: ['Emre','Mehmet','Mustafa','Burak','Can','Kerem','Arda','Efe','Yusuf','Berk','Onur'],
    last: ['Yilmaz','Kaya','Demir','Sahin','Celik','Yildiz','Aydin','Ozturk','Arslan','Dogan','Kilic','Aslan'] },
  { w: 2, country: 'Finland', cities: ['Helsinki','Espoo','Tampere','Turku'],
    first: ['Mikko','Eetu','Aleksi','Elias','Onni','Joonas','Veeti','Niko','Jere','Aapo'],
    last: ['Korhonen','Virtanen','Makinen','Nieminen','Hamalainen','Laine','Heikkinen','Koskinen','Jarvinen','Lehtonen'] },
  { w: 2, country: 'Sweden', cities: ['Stockholm','Gothenburg','Malmo','Uppsala'],
    first: ['Erik','Oscar','William','Hugo','Lucas','Viktor','Filip','Anton','Axel','Isak'],
    last: ['Andersson','Johansson','Karlsson','Nilsson','Eriksson','Larsson','Olsson','Persson','Svensson','Lindberg','Lindqvist'] },
  { w: 2, country: 'England', cities: ['London, ENG','Manchester, ENG','Birmingham, ENG','Leeds, ENG','Bristol, ENG'],
    first: ['Oliver','Harry','George','Jack','Charlie','Kieran','Reece','Callum','Joel','Ethan','Josh','Jamal','Tyrese'],
    last: ['Smith','Jones','Taylor','Brown','Williams','Wilson','Evans','Thomas','Roberts','Walker','Wright','Robinson','Thompson','Hughes','Edwards','Green','Clarke'] },
  { w: 2, country: 'Brazil', cities: ['Sao Paulo','Rio de Janeiro','Brasilia','Belo Horizonte','Franca'],
    first: ['Lucas','Gabriel','Matheus','Pedro','Guilherme','Rafael','Felipe','Bruno','Vinicius','Gustavo','Thiago','Joao'],
    last: ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Rodrigues','Almeida','Carvalho','Ribeiro'] },
  { w: 1, country: 'Netherlands', cities: ['Amsterdam','Rotterdam','Utrecht','The Hague'],
    first: ['Daan','Sem','Luuk','Jesse','Thijs','Bram','Lars','Ruben','Stijn','Niels'],
    last: ['de Jong','Jansen','de Vries','van Dijk','Bakker','Visser','Smit','Meijer','de Boer','Mulder'] },
  { w: 1, country: 'Belgium', cities: ['Brussels','Antwerp','Ghent','Liege'],
    first: ['Arthur','Louis','Jules','Victor','Lucas','Mathis','Wout','Senne','Thibault'],
    last: ['Peeters','Janssens','Maes','Jacobs','Mertens','Willems','Claes','Goossens','Wouters'] },
  { w: 1, country: 'Argentina', cities: ['Buenos Aires','Cordoba','Rosario','Bahia Blanca'],
    first: ['Santiago','Mateo','Tomas','Juan','Nicolas','Facundo','Lautaro','Agustin','Franco','Joaquin'],
    last: ['Gonzalez','Rodriguez','Gomez','Fernandez','Lopez','Diaz','Martinez','Perez','Sosa','Romero','Alvarez','Benitez'] },
  { w: 1, country: 'Israel', cities: ['Tel Aviv','Jerusalem','Haifa'],
    first: ['Yonatan','Itay','Omer','Noam','Ido','Daniel','Eitan','Amit','Tomer','Yuval'],
    last: ['Cohen','Levi','Mizrahi','Peretz','Biton','Friedman','Avraham','Katz','Azoulay','Dahan'] },
  { w: 1, country: 'DR Congo', cities: ['Kinshasa','Lubumbashi'],
    first: ['Jonathan','Christian','Patrick','Jordan','Grace','Merveille','Glody','Exauce'],
    last: ['Mukendi','Kabongo','Ilunga','Tshibangu','Mbuyi','Kalala','Lukusa','Kasongo'] }
];
const INTERNATIONAL_SHARE = 0.09;

// Kept under the old names for anything that reads them.
const FIRST_NAMES = US_FIRST;
const LAST_NAMES = US_LAST;

// Hometowns span the whole country, not just the traditional talent hubs:
// every state sends players to Division I, usually from its largest metro
// areas but often from much smaller towns.
const HOMETOWNS = [
  'Birmingham, AL','Montgomery, AL','Mobile, AL','Huntsville, AL','Tuscaloosa, AL',
  'Anchorage, AK','Phoenix, AZ','Tucson, AZ','Mesa, AZ','Chandler, AZ','Glendale, AZ',
  'Little Rock, AR','Fayetteville, AR','Fort Smith, AR',
  'Los Angeles, CA','Oakland, CA','San Diego, CA','Sacramento, CA','Fresno, CA','Long Beach, CA',
  'San Jose, CA','Compton, CA','Inglewood, CA','Riverside, CA','Bakersfield, CA','Chino Hills, CA',
  'Denver, CO','Aurora, CO','Colorado Springs, CO','Boulder, CO',
  'Hartford, CT','Bridgeport, CT','New Haven, CT','Stamford, CT',
  'Wilmington, DE','Washington, DC',
  'Miami, FL','Orlando, FL','Tampa, FL','Jacksonville, FL','Fort Lauderdale, FL','St. Petersburg, FL',
  'Tallahassee, FL','Naples, FL','Bradenton, FL','West Palm Beach, FL',
  'Atlanta, GA','Savannah, GA','Augusta, GA','Columbus, GA','Marietta, GA','Macon, GA',
  'Honolulu, HI','Boise, ID','Idaho Falls, ID',
  'Chicago, IL','Peoria, IL','Rockford, IL','Springfield, IL','Evanston, IL','Champaign, IL',
  'Indianapolis, IN','Fort Wayne, IN','South Bend, IN','Evansville, IN','Gary, IN','Bloomington, IN',
  'Des Moines, IA','Cedar Rapids, IA','Iowa City, IA',
  'Wichita, KS','Overland Park, KS','Topeka, KS','Lawrence, KS',
  'Louisville, KY','Lexington, KY','Bowling Green, KY',
  'New Orleans, LA','Baton Rouge, LA','Shreveport, LA','Lafayette, LA',
  'Portland, ME','Baltimore, MD','Silver Spring, MD','Annapolis, MD','Rockville, MD','Upper Marlboro, MD',
  'Boston, MA','Springfield, MA','Worcester, MA','Cambridge, MA',
  'Detroit, MI','Grand Rapids, MI','Flint, MI','Ann Arbor, MI','Lansing, MI','Saginaw, MI',
  'Minneapolis, MN','St. Paul, MN','Duluth, MN','Rochester, MN',
  'Jackson, MS','Gulfport, MS','Biloxi, MS',
  'St. Louis, MO','Kansas City, MO','Springfield, MO','Columbia, MO',
  'Billings, MT','Missoula, MT','Omaha, NE','Lincoln, NE',
  'Las Vegas, NV','Reno, NV','Henderson, NV','Manchester, NH',
  'Newark, NJ','Jersey City, NJ','Camden, NJ','Paterson, NJ','Trenton, NJ','Elizabeth, NJ',
  'Albuquerque, NM','Las Cruces, NM',
  'Brooklyn, NY','Bronx, NY','Queens, NY','Harlem, NY','Buffalo, NY','Rochester, NY',
  'Syracuse, NY','Yonkers, NY','Albany, NY','Long Island, NY',
  'Charlotte, NC','Raleigh, NC','Durham, NC','Greensboro, NC','Winston-Salem, NC','Fayetteville, NC',
  'Fargo, ND','Bismarck, ND',
  'Cleveland, OH','Columbus, OH','Cincinnati, OH','Toledo, OH','Akron, OH','Dayton, OH','Canton, OH',
  'Oklahoma City, OK','Tulsa, OK','Norman, OK',
  'Portland, OR','Eugene, OR','Salem, OR','Beaverton, OR',
  'Philadelphia, PA','Pittsburgh, PA','Allentown, PA','Harrisburg, PA','Erie, PA','Chester, PA',
  'Providence, RI','Columbia, SC','Charleston, SC','Greenville, SC','Rock Hill, SC',
  'Sioux Falls, SD','Rapid City, SD',
  'Memphis, TN','Nashville, TN','Knoxville, TN','Chattanooga, TN','Murfreesboro, TN',
  'Houston, TX','Dallas, TX','San Antonio, TX','Austin, TX','Fort Worth, TX','El Paso, TX',
  'Arlington, TX','Plano, TX','Lubbock, TX','Duncanville, TX','Garland, TX','Killeen, TX',
  'Salt Lake City, UT','Provo, UT','Ogden, UT','Burlington, VT',
  'Virginia Beach, VA','Richmond, VA','Norfolk, VA','Alexandria, VA','Newport News, VA','Hampton, VA',
  'Seattle, WA','Spokane, WA','Tacoma, WA','Federal Way, WA','Kent, WA',
  'Charleston, WV','Huntington, WV',
  'Milwaukee, WI','Madison, WI','Green Bay, WI','Racine, WI','Cheyenne, WY',
  // International pipelines that regularly feed Division I rosters.
  'Toronto, ON','Montreal, QC','Vancouver, BC','Hamilton, ON','Mississauga, ON',
  'Lagos, Nigeria','Dakar, Senegal','Bamako, Mali','Juba, South Sudan','Yaounde, Cameroon',
  'Belgrade, Serbia','Zagreb, Croatia','Ljubljana, Slovenia','Podgorica, Montenegro',
  'Paris, France','Lyon, France','Madrid, Spain','Barcelona, Spain','Rome, Italy','Milan, Italy',
  'Berlin, Germany','Munich, Germany','Vilnius, Lithuania','Riga, Latvia','Athens, Greece',
  'Melbourne, Australia','Sydney, Australia','Perth, Australia','London, England','Tokyo, Japan'
];

// High schools: a mix of the national academies that produce elite
// prospects and ordinary local programs, which is where most of a
// Division I roster actually comes from.
const NATIONAL_ACADEMIES = [
  'IMG Academy','Montverde Academy','Oak Hill Academy','Sierra Canyon','Prolific Prep',
  'La Lumiere','Findlay Prep','DeMatha Catholic','Gonzaga College HS','St. Benedict\'s Prep',
  'Brewster Academy','Putnam Science Academy','Link Academy','Wasatch Academy','AZ Compass Prep',
  'Combine Academy','Hillcrest Prep','Legacy Early College','Word of God Christian','Napa Christian'
];

const HS_PREFIX = [
  'Central','North','South','East','West','Lincoln','Washington','Jefferson','Roosevelt','Madison',
  'Franklin','Jackson','Wilson','Kennedy','Riverside','Lakeview','Hillcrest','Oakwood','Fairview',
  'Northside','Southside','Eastview','Westfield','Ridgewood','Brookfield','Highland','Summit',
  'Valley','Maple Grove','Cedar Ridge','Pinecrest','Bayside','Glenwood','Crestview','Woodlawn',
  'Mount Vernon','St. Mary\'s','St. Joseph\'s','Holy Cross','Bishop Kelley','Cardinal Newman',
  'Sacred Heart','Trinity','Providence Catholic','Christian Brothers','Marquette Catholic'
];

const HS_SUFFIX = ['High School','HS','Prep','Academy','Catholic HS','Senior High','Christian HS'];


// Positional height and weight norms. Values are inches / pounds:
// `avg` is the typical player, `lo`/`hi` bound the normal range, and a
// small share of players fall outside it so the odd 6'10" point guard or
// undersized centre still shows up.
const POSITION_BUILD = {
  PG: { avgHt: 74, loHt: 70, hiHt: 76, avgWt: 180, loWt: 160, hiWt: 200 },
  SG: { avgHt: 76, loHt: 72, hiHt: 79, avgWt: 192, loWt: 160, hiWt: 220 },
  SF: { avgHt: 79, loHt: 76, hiHt: 81, avgWt: 210, loWt: 170, hiWt: 250 },
  PF: { avgHt: 80, loHt: 78, hiHt: 83, avgWt: 225, loWt: 190, hiWt: 250 },
  C:  { avgHt: 82, loHt: 80, hiHt: 86, avgWt: 240, loWt: 195, hiWt: 260 },
  // The roster sheet also uses 'W' (wing) and combo-big labels.
  W:  { avgHt: 78, loHt: 75, hiHt: 81, avgWt: 200, loWt: 170, hiWt: 230 },
  'F/C': { avgHt: 81, loHt: 79, hiHt: 85, avgWt: 235, loWt: 195, hiWt: 258 },
  'G/F': { avgHt: 78, loHt: 75, hiHt: 80, avgWt: 205, loWt: 175, hiWt: 235 },
  CG: { avgHt: 75, loHt: 71, hiHt: 78, avgWt: 186, loWt: 165, hiWt: 210 }
};

// A generated (unranked) freshman shouldn't out-rate a real top-100
// recruit. Ranked prospects from the recruiting database routinely sit in
// the high 80s and 90s, so anonymous filler freshmen are held below this.
const GENERATED_FRESHMAN_CEILING = 79;

const OUTLIER_CHANCE = 0.04;   // how often a player breaks positional norms

// Roughly normal draw via the average of two uniforms, then clamped.
function bellDraw(avg, lo, hi, rng) {
  const spreadLo = avg - lo, spreadHi = hi - avg;
  const t = (rng() + rng()) / 2 - 0.5;           // -0.5..0.5, centre-weighted
  const v = avg + (t < 0 ? t * 2 * spreadLo : t * 2 * spreadHi);
  return Math.max(lo, Math.min(hi, v));
}

// Regional recruiting. Power-conference programs recruit nationally, but
// a mid-major or low-major roster is overwhelmingly local: same state,
// neighbouring states, and the nearest metro areas. Conference is used as
// the proxy for where a school sits, since that's the geography the master
// team list actually carries.
const CONFERENCE_REGION = {
  'America East': 'Northeast', 'NEC': 'Northeast', 'Patriot League': 'Northeast',
  'MAAC': 'Northeast', 'Ivy League': 'Northeast', 'A-10': 'Northeast',
  'CAA': 'Mid-Atlantic', 'Big South': 'Southeast', 'Southern': 'Southeast',
  'ASUN': 'Southeast', 'SWAC': 'South', 'MEAC': 'Southeast', 'Sun Belt': 'South',
  'Conference USA': 'South', 'Southland': 'Southwest', 'UAC': 'Southwest',
  'Horizon League': 'Midwest', 'MAC': 'Midwest', 'Missouri Valley': 'Midwest',
  'Ohio Valley': 'Midwest', 'The Summit': 'Plains',
  'Big Sky': 'Mountain', 'Big West': 'West', 'West Coast': 'West',
  'Mountain West': 'Mountain', 'American': 'South', 'Pac-12': 'West'
};

const REGION_HOMETOWNS = {
  Northeast: ['Boston, MA','Worcester, MA','Springfield, MA','Lowell, MA','Hartford, CT','Bridgeport, CT',
    'New Haven, CT','Providence, RI','Brooklyn, NY','Queens, NY','The Bronx, NY','Yonkers, NY','Albany, NY',
    'Buffalo, NY','Rochester, NY','Syracuse, NY','Newark, NJ','Jersey City, NJ','Camden, NJ','Trenton, NJ',
    'Paterson, NJ','Philadelphia, PA','Pittsburgh, PA','Allentown, PA','Scranton, PA','Portland, ME',
    'Manchester, NH','Burlington, VT'],
  'Mid-Atlantic': ['Baltimore, MD','Silver Spring, MD','Bethesda, MD','Washington, DC','Richmond, VA',
    'Virginia Beach, VA','Norfolk, VA','Roanoke, VA','Wilmington, DE','Charleston, WV','Morgantown, WV',
    'Philadelphia, PA','Raleigh, NC','Durham, NC','Charlotte, NC','Greensboro, NC'],
  Southeast: ['Atlanta, GA','Savannah, GA','Augusta, GA','Macon, GA','Columbia, SC','Charleston, SC',
    'Greenville, SC','Charlotte, NC','Raleigh, NC','Durham, NC','Winston-Salem, NC','Wilmington, NC',
    'Knoxville, TN','Chattanooga, TN','Nashville, TN','Memphis, TN','Birmingham, AL','Montgomery, AL',
    'Orlando, FL','Tampa, FL','Jacksonville, FL','Tallahassee, FL','Miami, FL','Fort Lauderdale, FL'],
  South: ['New Orleans, LA','Baton Rouge, LA','Shreveport, LA','Jackson, MS','Gulfport, MS','Hattiesburg, MS',
    'Mobile, AL','Birmingham, AL','Montgomery, AL','Memphis, TN','Little Rock, AR','Fayetteville, AR',
    'Houston, TX','Dallas, TX','San Antonio, TX','Beaumont, TX','Jackson, MS','Tallahassee, FL'],
  Southwest: ['Houston, TX','Dallas, TX','Fort Worth, TX','San Antonio, TX','Austin, TX','El Paso, TX',
    'Lubbock, TX','Beaumont, TX','Oklahoma City, OK','Tulsa, OK','Norman, OK','Little Rock, AR',
    'Albuquerque, NM','Las Cruces, NM','Shreveport, LA'],
  Midwest: ['Chicago, IL','Peoria, IL','Rockford, IL','East St. Louis, IL','Springfield, IL','Indianapolis, IN',
    'Fort Wayne, IN','Gary, IN','South Bend, IN','Evansville, IN','Detroit, MI','Flint, MI','Grand Rapids, MI',
    'Lansing, MI','Saginaw, MI','Cleveland, OH','Columbus, OH','Cincinnati, OH','Toledo, OH','Dayton, OH',
    'Akron, OH','Youngstown, OH','Milwaukee, WI','Madison, WI','Green Bay, WI','St. Louis, MO'],
  Plains: ['Minneapolis, MN','St. Paul, MN','Duluth, MN','Des Moines, IA','Cedar Rapids, IA','Omaha, NE',
    'Lincoln, NE','Sioux Falls, SD','Fargo, ND','Kansas City, MO','Topeka, KS','Wichita, KS','Springfield, MO',
    'Columbia, MO'],
  Mountain: ['Denver, CO','Colorado Springs, CO','Salt Lake City, UT','Provo, UT','Boise, ID','Billings, MT',
    'Las Vegas, NV','Reno, NV','Phoenix, AZ','Tucson, AZ','Albuquerque, NM','Cheyenne, WY','Spokane, WA'],
  West: ['Los Angeles, CA','Long Beach, CA','Riverside, CA','San Diego, CA','Oakland, CA','San Jose, CA',
    'Sacramento, CA','Fresno, CA','Portland, OR','Eugene, OR','Seattle, WA','Tacoma, WA','Spokane, WA',
    'Las Vegas, NV','Honolulu, HI','Phoenix, AZ']
};

const NATIONAL_RECRUITING_CONFS = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East']);

// Power-conference programs draw from everywhere; everyone else recruits
// mostly within their own footprint, with a minority of outside finds.
// American hometowns only: international players are placed by
// internationalIdentity, with names from their own country.
const US_HOMETOWNS = HOMETOWNS.filter(h => /, [A-Z]{2}$/.test(h));

function pickHometown(conference, rng = Math.random) {
  if (NATIONAL_RECRUITING_CONFS.has(conference)) return pick(US_HOMETOWNS, rng);
  const region = CONFERENCE_REGION[conference];
  const pool = region && REGION_HOMETOWNS[region];
  if (!pool) return pick(US_HOMETOWNS, rng);
  // About a quarter of a mid-major roster still comes from outside the
  // immediate region — transfers, junior college finds, internationals.
  return rng() < 0.74 ? pick(pool, rng) : pick(US_HOMETOWNS, rng);
}

function generateBuild(pos, rng = Math.random) {
  const b = POSITION_BUILD[pos] || POSITION_BUILD.SF;
  let inches = bellDraw(b.avgHt, b.loHt, b.hiHt, rng);

  // Rare outliers push a couple of inches past the positional range.
  if (rng() < OUTLIER_CHANCE) inches += (rng() < 0.5 ? -1 : 1) * (1 + rng() * 2.5);
  inches = Math.max(68, Math.min(88, Math.round(inches)));

  // Weight tracks height within the position's range rather than being
  // drawn independently, so a 7-footer isn't randomly 195 lbs.
  const htSpan = Math.max(1, b.hiHt - b.loHt);
  const htPos = Math.max(0, Math.min(1, (inches - b.loHt) / htSpan));
  const wtCentre = b.loWt + (b.hiWt - b.loWt) * (0.3 + htPos * 0.55);
  let weight = Math.round(wtCentre + (rng() - 0.5) * 22);
  weight = Math.max(150, Math.min(300, weight));

  return {
    ht: `${Math.floor(inches / 12)}'${inches % 12}`,
    wt: String(weight),
    heightInches: inches
  };
}

// Jersey numbers, most-wanted first. College players overwhelmingly wear
// 0-5, 10-15, 20-25, 30-35, 40-45 and 50-55 (a legacy of old NCAA rules
// that barred digits above 5 so referees could signal them by hand).
const POPULAR_JERSEYS = [23, 1, 3, 0, 5, 11, 24, 2, 32, 4, 22, 33, 10, 21, 12, 15,
                         20, 25, 34, 30, 13, 14, 31, 35, 44, 42, 40, 41, 43, 45,
                         50, 55, 51, 52, 53, 54];
const RARE_JERSEYS = [6, 7, 8, 9, 16, 17, 18, 19, 26, 27, 28, 29, 36, 37, 38, 39,
                      46, 47, 48, 49, 56, 77, 88, 99];
const RARE_JERSEY_CHANCE = 0.07;

// Assigns a number, preferring popular ones and skipping anything already
// worn on the roster. Callers pass players highest-rated first so the best
// players get first pick of the marquee numbers.
function pickJersey(taken, rng = Math.random) {
  if (rng() < RARE_JERSEY_CHANCE) {
    const rare = RARE_JERSEYS.filter(n => !taken.has(n));
    if (rare.length) {
      const n = rare[Math.floor(rng() * rare.length)];
      taken.add(n);
      return String(n);
    }
  }
  for (const n of POPULAR_JERSEYS) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  for (const n of RARE_JERSEYS) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  for (let n = 0; n <= 99; n++) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  return '';
}

// Conference "tiers" for average team strength — a light-touch, real-world-
// informed grouping so blue-blood conferences skew stronger on average and
// low-major leagues skew weaker, without pretending to rank every program
// individually. Any conference not listed defaults to tier 3.
const CONFERENCE_TIERS = {
  'ACC': 1, 'Big Ten': 1, 'Big 12': 1, 'SEC': 1, 'Big East': 1,
  'American': 2, 'A-10': 2, 'Mountain West': 2, 'West Coast': 2, 'Missouri Valley': 2, 'Conference USA': 2, 'Pac-12': 2,
  'CAA': 3, 'Sun Belt': 3, 'Ivy League': 3, 'Horizon League': 3, 'MAC': 3, 'Big West': 3,
  'Southern': 3, 'Big Sky': 3, 'Ohio Valley': 3, 'ASUN': 3, 'Patriot League': 3,
  'MAAC': 4, 'NEC': 4, 'Big South': 4, 'Southland': 4, 'SWAC': 4, 'MEAC': 4, 'America East': 4, 'The Summit': 4, 'UAC': 4
};

// [min, max] team-overall-rating range sampled per tier. Individual player
// ratings then vary around the sampled team overall (see buildRosterForTeam).
const TIER_RANGES = {
  1: [76, 92],
  2: [71, 85],
  3: [66, 80],
  4: [62, 76]
};

function getConferenceTier(conference) {
  return CONFERENCE_TIERS[conference] || 3;
}

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

// Roughly one player in seven comes from a national academy; the rest
// come from ordinary local high schools.
function generateHighSchool(rng = Math.random) {
  if (rng() < 0.14) return pick(NATIONAL_ACADEMIES, rng);
  return `${pick(HS_PREFIX, rng)} ${pick(HS_SUFFIX, rng)}`;
}

// Leans toward the front of a list, where the common names are.
function pickCommon(arr, rng = Math.random) {
  return arr[Math.min(arr.length - 1, Math.floor(arr.length * Math.pow(rng(), 1.6)))];
}

function americanIdentity(conference, rng) {
  const hometown = pickHometown(conference, rng);
  const st = (hometown.match(/,\s*([A-Z]{2})$/) || [])[1] || '';
  const region = Object.keys(STATE_REGION_NAMES).find(r => STATE_REGION_NAMES[r].includes(st));
  let first, last;
  const roll = rng();
  if (roll < (HISPANIC_SHARE[st] || 0.05)) {
    last = pickCommon(US_LAST_HISPANIC, rng);
    first = rng() < 0.45 ? pickCommon(US_FIRST_HISPANIC, rng) : pickCommon(US_FIRST, rng);
  } else if (region && region !== 'South' && rng() < 0.18) {
    last = pickCommon(REGIONAL_LAST[region], rng);
    first = pickCommon(US_FIRST_CLASSIC, rng);
  } else {
    last = region === 'South' && rng() < 0.18 ? pickCommon(US_LAST_SOUTH, rng) : pickCommon(US_LAST, rng);
    first = rng() < 0.3 ? pickCommon(US_FIRST_CLASSIC, rng) : pickCommon(US_FIRST, rng);
  }
  return { name: `${first} ${last}`, hometown };
}

function internationalIdentity(rng) {
  const total = INTERNATIONAL.reduce((n, c) => n + c.w, 0);
  let r = rng() * total, c = INTERNATIONAL[0];
  for (const x of INTERNATIONAL) { r -= x.w; if (r <= 0) { c = x; break; } }
  const city = pick(c.cities, rng);
  const hometown = /,/.test(city) ? city : `${city}, ${c.country}`;
  const first = pickCommon(c.first || US_FIRST, rng);
  const last = pickCommon(c.last || US_LAST, rng);
  return { name: `${first} ${last}`, hometown };
}

// A generated player's name and hometown, decided together so they match.
function generateIdentity(conference, usedNames, rng = Math.random) {
  let who, attempts = 0;
  do {
    who = rng() < INTERNATIONAL_SHARE ? internationalIdentity(rng) : americanIdentity(conference, rng);
    attempts++;
  } while (usedNames && usedNames.has(who.name) && attempts < 20);
  if (usedNames) usedNames.add(who.name);
  return who;
}

function generatePlayerName(usedNames, rng = Math.random) {
  return generateIdentity(null, usedNames, rng).name;
}

// Generates one filler player for a team, targeting the given position and
// a rating sampled around the team's baseline overall.
function generateFillerPlayer(school, conference, position, teamBaseline, rosterIndex, usedNames, rng = Math.random) {
  const classYears = ['FR', 'SO', 'JR', 'SR'];
  const cls = classYears[Math.floor(rng() * classYears.length)];
  const variance = (rng() - 0.5) * 16; // player rating spread around team baseline
  let rating = teamBaseline + variance - rosterIndex * 0.8;

  // Filler freshmen are the anonymous end of a recruiting class, so they
  // should sit below the genuinely ranked prospects in the real database.
  // A small share are "surprise" freshmen who buck that.
  if (cls === 'FR') {
    const surprise = rng() < 0.04;
    rating -= surprise ? 1 : (4 + rng() * 5);
    if (!surprise) rating = Math.min(rating, GENERATED_FRESHMAN_CEILING);
  }
  rating = Math.max(45, Math.min(94, Math.round(rating)));
  const build = generateBuild(position, rng);
  const who = generateIdentity(conference, usedNames, rng);
  return {
    id: `${school}_gen_${rosterIndex}_${Math.random().toString(36).slice(2, 7)}`,
    name: who.name,
    school, conference,
    school_logo: '',
    pos: position,
    class: cls,
    ht: build.ht,
    wt: build.wt,
    hometown: who.hometown,
    // Internationals come through academies and clubs, not US high schools.
    hs: /, [A-Z]{2}$/.test(who.hometown) ? generateHighSchool(rng) : '',

    rating,
    isRecruit: false,
    isGenerated: true,
    recClassYear: null,
    gameLog: [],
    accolades: [],
  };
}

// Ensures a roster has a viable position spread: at least 2 of each of
// PG/SG/SF/PF/C among the generated fill-ins (existing real players' actual
// positions are left untouched).
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

function nextNeededPosition(currentRoster, fillIndex, guardLean = 1) {
  const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  currentRoster.forEach(p => {
    const pos = POSITION_ORDER.includes(p.pos) ? p.pos : 'SF';
    counts[pos] = (counts[pos] || 0) + 1;
  });

  // Coaches recruit to their system. A guard-driven staff carries more
  // perimeter bodies; a post-oriented staff carries more size. Targets
  // shift around the baseline of 2 per spot rather than replacing it, so
  // every roster still covers all five positions.
  const tilt = (guardLean - 1) * 2.2;
  const targets = {
    PG: 2 + tilt, SG: 2 + tilt, SF: 2,
    PF: 2 - tilt, C: 2 - tilt
  };

  const ranked = POSITION_ORDER.map(pos => ({ pos, deficit: targets[pos] - (counts[pos] || 0) }));
  ranked.sort((a, b) => b.deficit - a.deficit);
  if (ranked[0].deficit > 0) return ranked[0].pos;
  return POSITION_ORDER[fillIndex % POSITION_ORDER.length];
}

// Core entry point: given the master {name, conference} team list and
// whatever real teams/players already exist (from the Google Sheets),
// returns a complete set of teams where every master-list school has a
// full roster — real players kept exactly as-is, gaps filled generated.
function normalizeSchoolKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Builds a lookup from every known spelling of a school (canonical name
// plus aliases) to its canonical master name, so a roster sheet that says
// "Texas Christian" resolves to the same team as one that says "TCU"
// instead of creating a duplicate program.
function buildSchoolAliasIndex(masterTeamList) {
  const index = {};
  masterTeamList.forEach(entry => {
    index[normalizeSchoolKey(entry.name)] = entry.name;
    (entry.aliases || []).forEach(a => {
      const k = normalizeSchoolKey(a);
      if (!index[k]) index[k] = entry.name;
    });
  });
  return index;
}

function buildFullUniverse(masterTeamList, existingTeams, opts = {}) {
  const targetRosterSize = opts.targetRosterSize || 13;
  const rng = opts.rng || Math.random;

  const aliasIndex = buildSchoolAliasIndex(masterTeamList);

  // Group incoming real teams by their CANONICAL name, merging any that
  // arrived under different spellings of the same school.
  const existingByName = {};
  existingTeams.forEach(t => {
    const canonical = aliasIndex[normalizeSchoolKey(t.school)] || t.school;
    if (!existingByName[canonical]) {
      existingByName[canonical] = { ...t, school: canonical, roster: [...(t.roster || [])] };
    } else {
      existingByName[canonical].roster.push(...(t.roster || []));
    }
  });

  const finalTeams = masterTeamList.map(masterEntry => {
    const existing = existingByName[masterEntry.name];
    // A program's own level (from its prestige) when the caller has one;
    // otherwise a draw from its conference tier's range.
    const level = opts.programLevelFor ? opts.programLevelFor(masterEntry.name, masterEntry.conference) : null;
    let teamBaseline;
    if (level != null) teamBaseline = level + (rng() - 0.5) * 12;   // programs of a level still vary, and some years are loaded
    else {
      const [lo, hi] = TIER_RANGES[getConferenceTier(masterEntry.conference)];
      teamBaseline = lo + rng() * (hi - lo);
    }

    const roster = existing && existing.roster ? [...existing.roster] : [];
    const usedNames = new Set(roster.map(p => p.name));
    const startCount = roster.length;

    // Coach influence on roster construction, supplied by the caller.
    const coachProfile = (opts.coachProfileFor && opts.coachProfileFor(masterEntry.name)) || null;
    const guardLean = coachProfile ? (coachProfile.guardLean || 1) : 1;

    // Filler players exist to round out a roster, not to headline it. If
    // the team already has real players from the roster sheet, generated
    // upperclassmen are held below the best of them — otherwise a team's
    // leading scorer could be somebody the engine invented. Freshmen are
    // exempt: a genuinely elite recruit is allowed to be the best player
    // on his team from day one.
    let realCeiling = null;
    if (startCount > 0) {
      const realBest = Math.max(...roster.map(p => parseFloat(p.rating) || 0));
      realCeiling = realBest - 1;
    }

    for (let i = startCount; i < targetRosterSize; i++) {
      const pos = nextNeededPosition(roster, i, guardLean);
      const filler = generateFillerPlayer(masterEntry.name, masterEntry.conference, pos, teamBaseline, i, usedNames, rng);
      if (realCeiling !== null && filler.class !== 'FR' && filler.rating > realCeiling) {
        filler.rating = Math.max(45, Math.round(realCeiling));
      }
      roster.push(filler);
    }

    // Jersey numbers, assigned per team so nobody duplicates a real
    // player's number. Best players pick first, so the marquee numbers go
    // to the guys most likely to be featured.
    const takenJerseys = new Set();
    roster.forEach(p => {
      const n = parseInt(p.jersey, 10);
      if (!isNaN(n)) takenJerseys.add(n);
    });
    roster
      .filter(p => !p.jersey)
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
      .forEach(p => { p.jersey = pickJersey(takenJerseys, rng); });

    return {
      school: masterEntry.name,
      conference: masterEntry.conference,
      roster,
      generatedFillCount: roster.length - startCount,
      hadRealData: startCount > 0
    };
  });

  // Any real team from the sheets that ISN'T in the master list (e.g. a
  // typo, or a fictional school) still gets included as-is rather than
  // silently dropped — better to surface a mismatch than lose real data.
  const masterNames = new Set(masterTeamList.map(t => t.name));
  const unmatched = Object.values(existingByName).filter(t => !masterNames.has(t.school));

  return { teams: [...finalTeams, ...unmatched], unmatchedRealTeams: unmatched.map(t => t.school) };
}

const RosterGen = {
  FIRST_NAMES, LAST_NAMES, INTERNATIONAL, generateIdentity, HOMETOWNS, CONFERENCE_TIERS, TIER_RANGES,
  getConferenceTier, normalizeSchoolKey, buildSchoolAliasIndex, generateHighSchool, pickHometown, americanIdentity, internationalIdentity,
  POSITION_BUILD, generateBuild, pickJersey, POPULAR_JERSEYS, RARE_JERSEYS, generatePlayerName, generateFillerPlayer, nextNeededPosition, buildFullUniverse
};

if (typeof module !== 'undefined' && module.exports) module.exports = RosterGen;
else if (typeof window !== 'undefined') window.RosterGen = RosterGen;
