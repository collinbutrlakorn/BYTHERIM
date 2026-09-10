// Master list of NCAA Division I men's basketball programs and their
// conferences, current as of the 2026-27 season (source: Wikipedia's List
// of NCAA Division I men's basketball programs, 365 teams / 31 conferences).
// Used to auto-fill the universe with every real D1 team + conference even
// when the Google Sheets roster data only covers a handful of schools —
// see roster-gen.js for how gaps get filled with generated players.
const TeamsMaster = [
  {
    "name": "Albany",
    "conference": "America East"
  },
  {
    "name": "Binghamton",
    "conference": "America East"
  },
  {
    "name": "Bryant",
    "conference": "America East"
  },
  {
    "name": "Maine",
    "conference": "America East"
  },
  {
    "name": "UMBC",
    "conference": "America East"
  },
  {
    "name": "UMass Lowell",
    "conference": "America East"
  },
  {
    "name": "New Hampshire",
    "conference": "America East"
  },
  {
    "name": "NJIT",
    "conference": "America East"
  },
  {
    "name": "Vermont",
    "conference": "America East"
  },
  {
    "name": "Charlotte",
    "conference": "American"
  },
  {
    "name": "East Carolina",
    "conference": "American"
  },
  {
    "name": "Florida Atlantic",
    "conference": "American"
  },
  {
    "name": "Memphis",
    "conference": "American"
  },
  {
    "name": "North Texas",
    "conference": "American"
  },
  {
    "name": "Rice",
    "conference": "American"
  },
  {
    "name": "South Florida",
    "conference": "American"
  },
  {
    "name": "Temple",
    "conference": "American"
  },
  {
    "name": "UAB",
    "conference": "American"
  },
  {
    "name": "UTSA",
    "conference": "American"
  },
  {
    "name": "Tulane",
    "conference": "American"
  },
  {
    "name": "Tulsa",
    "conference": "American"
  },
  {
    "name": "Wichita State",
    "conference": "American"
  },
  {
    "name": "Boston College",
    "conference": "ACC"
  },
  {
    "name": "Cal",
    "conference": "ACC"
  },
  {
    "name": "Clemson",
    "conference": "ACC"
  },
  {
    "name": "Duke",
    "conference": "ACC"
  },
  {
    "name": "Florida State",
    "conference": "ACC"
  },
  {
    "name": "Georgia Tech",
    "conference": "ACC"
  },
  {
    "name": "Louisville",
    "conference": "ACC"
  },
  {
    "name": "Miami",
    "conference": "ACC"
  },
  {
    "name": "North Carolina",
    "conference": "ACC"
  },
  {
    "name": "NC State",
    "conference": "ACC"
  },
  {
    "name": "Notre Dame",
    "conference": "ACC"
  },
  {
    "name": "Pitt",
    "conference": "ACC"
  },
  {
    "name": "SMU",
    "conference": "ACC"
  },
  {
    "name": "Stanford",
    "conference": "ACC"
  },
  {
    "name": "Syracuse",
    "conference": "ACC"
  },
  {
    "name": "Virginia",
    "conference": "ACC"
  },
  {
    "name": "Virginia Tech",
    "conference": "ACC"
  },
  {
    "name": "Wake Forest",
    "conference": "ACC"
  },
  {
    "name": "Bellarmine",
    "conference": "ASUN"
  },
  {
    "name": "Florida Gulf Coast",
    "conference": "ASUN"
  },
  {
    "name": "Jacksonville",
    "conference": "ASUN"
  },
  {
    "name": "Lipscomb",
    "conference": "ASUN"
  },
  {
    "name": "North Florida",
    "conference": "ASUN"
  },
  {
    "name": "Queens of Charlotte",
    "conference": "ASUN"
  },
  {
    "name": "Stetson",
    "conference": "ASUN"
  },
  {
    "name": "West Florida",
    "conference": "ASUN"
  },
  {
    "name": "Davidson",
    "conference": "A-10"
  },
  {
    "name": "Dayton",
    "conference": "A-10"
  },
  {
    "name": "Duquesne",
    "conference": "A-10"
  },
  {
    "name": "Fordham",
    "conference": "A-10"
  },
  {
    "name": "George Mason",
    "conference": "A-10"
  },
  {
    "name": "George Washington",
    "conference": "A-10"
  },
  {
    "name": "La Salle",
    "conference": "A-10"
  },
  {
    "name": "Loyola Chicago",
    "conference": "A-10"
  },
  {
    "name": "Rhode Island",
    "conference": "A-10"
  },
  {
    "name": "Richmond",
    "conference": "A-10"
  },
  {
    "name": "St. Bonaventure",
    "conference": "A-10"
  },
  {
    "name": "Saint Joseph's",
    "conference": "A-10"
  },
  {
    "name": "Saint Louis",
    "conference": "A-10"
  },
  {
    "name": "VCU",
    "conference": "A-10"
  },
  {
    "name": "Butler",
    "conference": "Big East"
  },
  {
    "name": "Creighton",
    "conference": "Big East"
  },
  {
    "name": "DePaul",
    "conference": "Big East"
  },
  {
    "name": "Georgetown",
    "conference": "Big East"
  },
  {
    "name": "Marquette",
    "conference": "Big East"
  },
  {
    "name": "Providence",
    "conference": "Big East"
  },
  {
    "name": "St. John's",
    "conference": "Big East"
  },
  {
    "name": "Seton Hall",
    "conference": "Big East"
  },
  {
    "name": "Connecticut",
    "conference": "Big East"
  },
  {
    "name": "Villanova",
    "conference": "Big East"
  },
  {
    "name": "Xavier",
    "conference": "Big East"
  },
  {
    "name": "Eastern Washington",
    "conference": "Big Sky"
  },
  {
    "name": "Idaho",
    "conference": "Big Sky"
  },
  {
    "name": "Idaho State",
    "conference": "Big Sky"
  },
  {
    "name": "Montana",
    "conference": "Big Sky"
  },
  {
    "name": "Montana State",
    "conference": "Big Sky"
  },
  {
    "name": "Northern Arizona",
    "conference": "Big Sky"
  },
  {
    "name": "Northern Colorado",
    "conference": "Big Sky"
  },
  {
    "name": "Portland State",
    "conference": "Big Sky"
  },
  {
    "name": "Southern Utah",
    "conference": "Big Sky"
  },
  {
    "name": "Utah Tech",
    "conference": "Big Sky"
  },
  {
    "name": "Weber State",
    "conference": "Big Sky"
  },
  {
    "name": "Charleston Southern",
    "conference": "Big South"
  },
  {
    "name": "Gardner-Webb",
    "conference": "Big South"
  },
  {
    "name": "High Point",
    "conference": "Big South"
  },
  {
    "name": "Longwood",
    "conference": "Big South"
  },
  {
    "name": "Presbyterian",
    "conference": "Big South"
  },
  {
    "name": "Radford",
    "conference": "Big South"
  },
  {
    "name": "UNC Asheville",
    "conference": "Big South"
  },
  {
    "name": "USC Upstate",
    "conference": "Big South"
  },
  {
    "name": "Winthrop",
    "conference": "Big South"
  },
  {
    "name": "UCLA",
    "conference": "Big Ten"
  },
  {
    "name": "Illinois",
    "conference": "Big Ten"
  },
  {
    "name": "Indiana",
    "conference": "Big Ten"
  },
  {
    "name": "Iowa",
    "conference": "Big Ten"
  },
  {
    "name": "Maryland",
    "conference": "Big Ten"
  },
  {
    "name": "Michigan",
    "conference": "Big Ten"
  },
  {
    "name": "Michigan State",
    "conference": "Big Ten"
  },
  {
    "name": "Minnesota",
    "conference": "Big Ten"
  },
  {
    "name": "Nebraska",
    "conference": "Big Ten"
  },
  {
    "name": "Northwestern",
    "conference": "Big Ten"
  },
  {
    "name": "Ohio State",
    "conference": "Big Ten"
  },
  {
    "name": "Oregon",
    "conference": "Big Ten"
  },
  {
    "name": "Penn State",
    "conference": "Big Ten"
  },
  {
    "name": "Purdue",
    "conference": "Big Ten"
  },
  {
    "name": "Rutgers",
    "conference": "Big Ten"
  },
  {
    "name": "USC",
    "conference": "Big Ten"
  },
  {
    "name": "Washington",
    "conference": "Big Ten"
  },
  {
    "name": "Wisconsin",
    "conference": "Big Ten"
  },
  {
    "name": "Arizona",
    "conference": "Big 12"
  },
  {
    "name": "Arizona State",
    "conference": "Big 12"
  },
  {
    "name": "Baylor",
    "conference": "Big 12"
  },
  {
    "name": "BYU",
    "conference": "Big 12"
  },
  {
    "name": "UCF",
    "conference": "Big 12"
  },
  {
    "name": "Cincinnati",
    "conference": "Big 12"
  },
  {
    "name": "Colorado",
    "conference": "Big 12"
  },
  {
    "name": "Houston",
    "conference": "Big 12"
  },
  {
    "name": "Iowa State",
    "conference": "Big 12"
  },
  {
    "name": "Kansas",
    "conference": "Big 12"
  },
  {
    "name": "Kansas State",
    "conference": "Big 12"
  },
  {
    "name": "Oklahoma State",
    "conference": "Big 12"
  },
  {
    "name": "TCU",
    "conference": "Big 12"
  },
  {
    "name": "Texas Tech",
    "conference": "Big 12"
  },
  {
    "name": "Utah",
    "conference": "Big 12"
  },
  {
    "name": "West Virginia",
    "conference": "Big 12"
  },
  {
    "name": "California Baptist",
    "conference": "Big West"
  },
  {
    "name": "Cal Poly",
    "conference": "Big West"
  },
  {
    "name": "CSU Bakersfield",
    "conference": "Big West"
  },
  {
    "name": "Cal State Fullerton",
    "conference": "Big West"
  },
  {
    "name": "Cal State Northridge",
    "conference": "Big West"
  },
  {
    "name": "Long Beach State",
    "conference": "Big West"
  },
  {
    "name": "Sacramento State",
    "conference": "Big West"
  },
  {
    "name": "UC Irvine",
    "conference": "Big West"
  },
  {
    "name": "UC Riverside",
    "conference": "Big West"
  },
  {
    "name": "UC San Diego",
    "conference": "Big West"
  },
  {
    "name": "UC Santa Barbara",
    "conference": "Big West"
  },
  {
    "name": "Utah Valley",
    "conference": "Big West"
  },
  {
    "name": "Campbell",
    "conference": "CAA"
  },
  {
    "name": "Charleston",
    "conference": "CAA"
  },
  {
    "name": "Drexel",
    "conference": "CAA"
  },
  {
    "name": "Elon",
    "conference": "CAA"
  },
  {
    "name": "Hampton",
    "conference": "CAA"
  },
  {
    "name": "Hofstra",
    "conference": "CAA"
  },
  {
    "name": "Monmouth",
    "conference": "CAA"
  },
  {
    "name": "North Carolina A&T",
    "conference": "CAA"
  },
  {
    "name": "Northeastern",
    "conference": "CAA"
  },
  {
    "name": "Stony Brook",
    "conference": "CAA"
  },
  {
    "name": "Towson",
    "conference": "CAA"
  },
  {
    "name": "UNCW",
    "conference": "CAA"
  },
  {
    "name": "William & Mary",
    "conference": "CAA"
  },
  {
    "name": "Delaware",
    "conference": "Conference USA"
  },
  {
    "name": "FIU",
    "conference": "Conference USA"
  },
  {
    "name": "Jacksonville State",
    "conference": "Conference USA"
  },
  {
    "name": "Kennesaw State",
    "conference": "Conference USA"
  },
  {
    "name": "Liberty",
    "conference": "Conference USA"
  },
  {
    "name": "Middle Tennessee",
    "conference": "Conference USA"
  },
  {
    "name": "Missouri State",
    "conference": "Conference USA"
  },
  {
    "name": "New Mexico State",
    "conference": "Conference USA"
  },
  {
    "name": "Sam Houston State",
    "conference": "Conference USA"
  },
  {
    "name": "Western Kentucky",
    "conference": "Conference USA"
  },
  {
    "name": "Cleveland State",
    "conference": "Horizon League"
  },
  {
    "name": "Detroit Mercy",
    "conference": "Horizon League"
  },
  {
    "name": "IU Indy",
    "conference": "Horizon League"
  },
  {
    "name": "Milwaukee",
    "conference": "Horizon League"
  },
  {
    "name": "Northern Illinois",
    "conference": "Horizon League"
  },
  {
    "name": "Northern Kentucky",
    "conference": "Horizon League"
  },
  {
    "name": "Oakland",
    "conference": "Horizon League"
  },
  {
    "name": "Purdue Fort Wayne",
    "conference": "Horizon League"
  },
  {
    "name": "Robert Morris",
    "conference": "Horizon League"
  },
  {
    "name": "Green Bay",
    "conference": "Horizon League"
  },
  {
    "name": "Wright State",
    "conference": "Horizon League"
  },
  {
    "name": "Youngstown State",
    "conference": "Horizon League"
  },
  {
    "name": "Brown",
    "conference": "Ivy League"
  },
  {
    "name": "Columbia",
    "conference": "Ivy League"
  },
  {
    "name": "Cornell",
    "conference": "Ivy League"
  },
  {
    "name": "Dartmouth",
    "conference": "Ivy League"
  },
  {
    "name": "Harvard",
    "conference": "Ivy League"
  },
  {
    "name": "Pennsylvania",
    "conference": "Ivy League"
  },
  {
    "name": "Princeton",
    "conference": "Ivy League"
  },
  {
    "name": "Yale",
    "conference": "Ivy League"
  },
  {
    "name": "Canisius",
    "conference": "MAAC"
  },
  {
    "name": "Fairfield",
    "conference": "MAAC"
  },
  {
    "name": "Iona",
    "conference": "MAAC"
  },
  {
    "name": "Manhattan",
    "conference": "MAAC"
  },
  {
    "name": "Marist",
    "conference": "MAAC"
  },
  {
    "name": "Merrimack",
    "conference": "MAAC"
  },
  {
    "name": "Mount St. Mary's",
    "conference": "MAAC"
  },
  {
    "name": "Niagara",
    "conference": "MAAC"
  },
  {
    "name": "Quinnipiac",
    "conference": "MAAC"
  },
  {
    "name": "Rider",
    "conference": "MAAC"
  },
  {
    "name": "Sacred Heart",
    "conference": "MAAC"
  },
  {
    "name": "Saint Peter's",
    "conference": "MAAC"
  },
  {
    "name": "Siena",
    "conference": "MAAC"
  },
  {
    "name": "Akron",
    "conference": "MAC"
  },
  {
    "name": "Ball State",
    "conference": "MAC"
  },
  {
    "name": "Bowling Green",
    "conference": "MAC"
  },
  {
    "name": "Buffalo",
    "conference": "MAC"
  },
  {
    "name": "Central Michigan",
    "conference": "MAC"
  },
  {
    "name": "Eastern Michigan",
    "conference": "MAC"
  },
  {
    "name": "Kent State",
    "conference": "MAC"
  },
  {
    "name": "UMass",
    "conference": "MAC"
  },
  {
    "name": "Miami (OH)",
    "conference": "MAC"
  },
  {
    "name": "Ohio",
    "conference": "MAC"
  },
  {
    "name": "Toledo",
    "conference": "MAC"
  },
  {
    "name": "Western Michigan",
    "conference": "MAC"
  },
  {
    "name": "Coppin State",
    "conference": "MEAC"
  },
  {
    "name": "Delaware State",
    "conference": "MEAC"
  },
  {
    "name": "Howard",
    "conference": "MEAC"
  },
  {
    "name": "UMES",
    "conference": "MEAC"
  },
  {
    "name": "Morgan State",
    "conference": "MEAC"
  },
  {
    "name": "Norfolk State",
    "conference": "MEAC"
  },
  {
    "name": "NCCU",
    "conference": "MEAC"
  },
  {
    "name": "SC State",
    "conference": "MEAC"
  },
  {
    "name": "Belmont",
    "conference": "Missouri Valley"
  },
  {
    "name": "Bradley",
    "conference": "Missouri Valley"
  },
  {
    "name": "Drake",
    "conference": "Missouri Valley"
  },
  {
    "name": "Evansville",
    "conference": "Missouri Valley"
  },
  {
    "name": "Illinois State",
    "conference": "Missouri Valley"
  },
  {
    "name": "Indiana State",
    "conference": "Missouri Valley"
  },
  {
    "name": "Murray State",
    "conference": "Missouri Valley"
  },
  {
    "name": "Northern Iowa",
    "conference": "Missouri Valley"
  },
  {
    "name": "Southern Illinois",
    "conference": "Missouri Valley"
  },
  {
    "name": "Illinois Chicago",
    "conference": "Missouri Valley"
  },
  {
    "name": "Valparaiso",
    "conference": "Missouri Valley"
  },
  {
    "name": "Air Force",
    "conference": "Mountain West"
  },
  {
    "name": "Grand Canyon",
    "conference": "Mountain West"
  },
  {
    "name": "Hawaii",
    "conference": "Mountain West"
  },
  {
    "name": "Nevada",
    "conference": "Mountain West"
  },
  {
    "name": "New Mexico",
    "conference": "Mountain West"
  },
  {
    "name": "San Jose State",
    "conference": "Mountain West"
  },
  {
    "name": "UC Davis",
    "conference": "Mountain West"
  },
  {
    "name": "UNLV",
    "conference": "Mountain West"
  },
  {
    "name": "UTEP",
    "conference": "Mountain West"
  },
  {
    "name": "Wyoming",
    "conference": "Mountain West"
  },
  {
    "name": "Central Connecticut",
    "conference": "NEC"
  },
  {
    "name": "Chicago State",
    "conference": "NEC"
  },
  {
    "name": "Fairleigh Dickinson",
    "conference": "NEC"
  },
  {
    "name": "Le Moyne",
    "conference": "NEC"
  },
  {
    "name": "Long Island",
    "conference": "NEC"
  },
  {
    "name": "Mercyhurst",
    "conference": "NEC"
  },
  {
    "name": "New Haven",
    "conference": "NEC"
  },
  {
    "name": "Stonehill",
    "conference": "NEC"
  },
  {
    "name": "Wagner",
    "conference": "NEC"
  },
  {
    "name": "Eastern Illinois",
    "conference": "Ohio Valley"
  },
  {
    "name": "Lindenwood",
    "conference": "Ohio Valley"
  },
  {
    "name": "Morehead State",
    "conference": "Ohio Valley"
  },
  {
    "name": "Southeast Missouri",
    "conference": "Ohio Valley"
  },
  {
    "name": "SIU Edwardsville",
    "conference": "Ohio Valley"
  },
  {
    "name": "Southern Indiana",
    "conference": "Ohio Valley"
  },
  {
    "name": "UT Martin",
    "conference": "Ohio Valley"
  },
  {
    "name": "Tennessee State",
    "conference": "Ohio Valley"
  },
  {
    "name": "Western Illinois",
    "conference": "Ohio Valley"
  },
  {
    "name": "Boise State",
    "conference": "Pac-12"
  },
  {
    "name": "Colorado State",
    "conference": "Pac-12"
  },
  {
    "name": "Fresno State",
    "conference": "Pac-12"
  },
  {
    "name": "Gonzaga",
    "conference": "Pac-12"
  },
  {
    "name": "Oregon State",
    "conference": "Pac-12"
  },
  {
    "name": "San Diego State",
    "conference": "Pac-12"
  },
  {
    "name": "Texas State",
    "conference": "Pac-12"
  },
  {
    "name": "Utah State",
    "conference": "Pac-12"
  },
  {
    "name": "Washington State",
    "conference": "Pac-12"
  },
  {
    "name": "American",
    "conference": "Patriot League"
  },
  {
    "name": "Army",
    "conference": "Patriot League"
  },
  {
    "name": "Boston",
    "conference": "Patriot League"
  },
  {
    "name": "Bucknell",
    "conference": "Patriot League"
  },
  {
    "name": "Colgate",
    "conference": "Patriot League"
  },
  {
    "name": "Holy Cross",
    "conference": "Patriot League"
  },
  {
    "name": "Lafayette",
    "conference": "Patriot League"
  },
  {
    "name": "Lehigh",
    "conference": "Patriot League"
  },
  {
    "name": "Loyola Maryland",
    "conference": "Patriot League"
  },
  {
    "name": "Navy",
    "conference": "Patriot League"
  },
  {
    "name": "Alabama",
    "conference": "SEC"
  },
  {
    "name": "Arkansas",
    "conference": "SEC"
  },
  {
    "name": "Auburn",
    "conference": "SEC"
  },
  {
    "name": "Florida",
    "conference": "SEC"
  },
  {
    "name": "Georgia",
    "conference": "SEC"
  },
  {
    "name": "Kentucky",
    "conference": "SEC"
  },
  {
    "name": "LSU",
    "conference": "SEC"
  },
  {
    "name": "Ole Miss",
    "conference": "SEC"
  },
  {
    "name": "Mississippi State",
    "conference": "SEC"
  },
  {
    "name": "Missouri",
    "conference": "SEC"
  },
  {
    "name": "Oklahoma",
    "conference": "SEC"
  },
  {
    "name": "South Carolina",
    "conference": "SEC"
  },
  {
    "name": "Tennessee",
    "conference": "SEC"
  },
  {
    "name": "Texas",
    "conference": "SEC"
  },
  {
    "name": "Texas A&M",
    "conference": "SEC"
  },
  {
    "name": "Vanderbilt",
    "conference": "SEC"
  },
  {
    "name": "Chattanooga",
    "conference": "Southern"
  },
  {
    "name": "Citadel",
    "conference": "Southern"
  },
  {
    "name": "ETSU",
    "conference": "Southern"
  },
  {
    "name": "Furman",
    "conference": "Southern"
  },
  {
    "name": "Mercer",
    "conference": "Southern"
  },
  {
    "name": "Samford",
    "conference": "Southern"
  },
  {
    "name": "Tennessee Tech",
    "conference": "Southern"
  },
  {
    "name": "UNCG",
    "conference": "Southern"
  },
  {
    "name": "VMI",
    "conference": "Southern"
  },
  {
    "name": "Western Carolina",
    "conference": "Southern"
  },
  {
    "name": "Wofford",
    "conference": "Southern"
  },
  {
    "name": "East Texas A&M",
    "conference": "Southland"
  },
  {
    "name": "Houston Christian",
    "conference": "Southland"
  },
  {
    "name": "Incarnate Word",
    "conference": "Southland"
  },
  {
    "name": "Lamar",
    "conference": "Southland"
  },
  {
    "name": "LSU New Orleans",
    "conference": "Southland"
  },
  {
    "name": "McNeese State",
    "conference": "Southland"
  },
  {
    "name": "Nicholls State",
    "conference": "Southland"
  },
  {
    "name": "Northwestern State",
    "conference": "Southland"
  },
  {
    "name": "Southeastern Louisiana",
    "conference": "Southland"
  },
  {
    "name": "Stephen F. Austin",
    "conference": "Southland"
  },
  {
    "name": "Texas A&M-Corpus Christi",
    "conference": "Southland"
  },
  {
    "name": "UTRGV",
    "conference": "Southland"
  },
  {
    "name": "Alabama A&M",
    "conference": "SWAC"
  },
  {
    "name": "Alabama State",
    "conference": "SWAC"
  },
  {
    "name": "Alcorn State",
    "conference": "SWAC"
  },
  {
    "name": "Arkansas-Pine Bluff",
    "conference": "SWAC"
  },
  {
    "name": "Bethune-Cookman",
    "conference": "SWAC"
  },
  {
    "name": "Florida A&M",
    "conference": "SWAC"
  },
  {
    "name": "Grambling State",
    "conference": "SWAC"
  },
  {
    "name": "Jackson State",
    "conference": "SWAC"
  },
  {
    "name": "Mississippi Valley State",
    "conference": "SWAC"
  },
  {
    "name": "Prairie View A&M",
    "conference": "SWAC"
  },
  {
    "name": "Southern",
    "conference": "SWAC"
  },
  {
    "name": "Texas Southern",
    "conference": "SWAC"
  },
  {
    "name": "Kansas City",
    "conference": "The Summit"
  },
  {
    "name": "North Dakota",
    "conference": "The Summit"
  },
  {
    "name": "North Dakota State",
    "conference": "The Summit"
  },
  {
    "name": "Nebraska Omaha",
    "conference": "The Summit"
  },
  {
    "name": "Oral Roberts",
    "conference": "The Summit"
  },
  {
    "name": "St. Thomas",
    "conference": "The Summit"
  },
  {
    "name": "South Dakota",
    "conference": "The Summit"
  },
  {
    "name": "South Dakota State",
    "conference": "The Summit"
  },
  {
    "name": "Appalachian State",
    "conference": "Sun Belt"
  },
  {
    "name": "Arkansas State",
    "conference": "Sun Belt"
  },
  {
    "name": "Coastal Carolina",
    "conference": "Sun Belt"
  },
  {
    "name": "Georgia Southern",
    "conference": "Sun Belt"
  },
  {
    "name": "Georgia State",
    "conference": "Sun Belt"
  },
  {
    "name": "James Madison",
    "conference": "Sun Belt"
  },
  {
    "name": "Louisiana",
    "conference": "Sun Belt"
  },
  {
    "name": "Louisiana-Monroe",
    "conference": "Sun Belt"
  },
  {
    "name": "Louisiana Tech",
    "conference": "Sun Belt"
  },
  {
    "name": "Marshall",
    "conference": "Sun Belt"
  },
  {
    "name": "Old Dominion",
    "conference": "Sun Belt"
  },
  {
    "name": "South Alabama",
    "conference": "Sun Belt"
  },
  {
    "name": "Southern Miss",
    "conference": "Sun Belt"
  },
  {
    "name": "Troy",
    "conference": "Sun Belt"
  },
  {
    "name": "Abilene Christian",
    "conference": "UAC"
  },
  {
    "name": "Austin Peay State",
    "conference": "UAC"
  },
  {
    "name": "Central Arkansas",
    "conference": "UAC"
  },
  {
    "name": "Eastern Kentucky",
    "conference": "UAC"
  },
  {
    "name": "Little Rock",
    "conference": "UAC"
  },
  {
    "name": "North Alabama",
    "conference": "UAC"
  },
  {
    "name": "Tarleton State",
    "conference": "UAC"
  },
  {
    "name": "UT Arlington",
    "conference": "UAC"
  },
  {
    "name": "West Georgia",
    "conference": "UAC"
  },
  {
    "name": "Denver",
    "conference": "West Coast"
  },
  {
    "name": "Loyola Marymount",
    "conference": "West Coast"
  },
  {
    "name": "Pacific",
    "conference": "West Coast"
  },
  {
    "name": "Pepperdine",
    "conference": "West Coast"
  },
  {
    "name": "Portland",
    "conference": "West Coast"
  },
  {
    "name": "Saint Mary's",
    "conference": "West Coast"
  },
  {
    "name": "San Diego",
    "conference": "West Coast"
  },
  {
    "name": "San Francisco",
    "conference": "West Coast"
  },
  {
    "name": "Santa Clara",
    "conference": "West Coast"
  },
  {
    "name": "Seattle",
    "conference": "West Coast"
  }
];

if (typeof module !== "undefined" && module.exports) module.exports = TeamsMaster;
else if (typeof window !== "undefined") window.TeamsMaster = TeamsMaster;
