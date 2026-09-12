// Master list of NCAA Division I men's basketball programs, their
// conferences, and alternate names. The aliases matter: a roster sheet
// that says "Texas Christian" must resolve to the same team as "TCU",
// otherwise the universe ends up with two separate schools. Aliases that
// would be ambiguous between two programs (e.g. a bare "Boston") are
// deliberately excluded — an unmatched name is safer than a wrong match.
const TeamsMaster = [
  {
    "name": "Albany",
    "conference": "America East",
    "aliases": [
      "UAlbany",
      "University at Albany"
    ]
  },
  {
    "name": "Binghamton",
    "conference": "America East",
    "aliases": [
      "Binghamton University"
    ]
  },
  {
    "name": "Bryant",
    "conference": "America East",
    "aliases": [
      "Bryant University"
    ]
  },
  {
    "name": "Maine",
    "conference": "America East",
    "aliases": [
      "UMaine",
      "University of Maine"
    ]
  },
  {
    "name": "UMBC",
    "conference": "America East",
    "aliases": [
      "Maryland, Baltimore County",
      "University of Maryland, Baltimore County"
    ]
  },
  {
    "name": "UMass Lowell",
    "conference": "America East",
    "aliases": [
      "Massachusetts Lowell",
      "University of Massachusetts Lowell"
    ]
  },
  {
    "name": "New Hampshire",
    "conference": "America East",
    "aliases": [
      "University of New Hampshire"
    ]
  },
  {
    "name": "NJIT",
    "conference": "America East",
    "aliases": [
      "New Jersey Institute of Technology"
    ]
  },
  {
    "name": "Vermont",
    "conference": "America East",
    "aliases": [
      "University of Vermont"
    ]
  },
  {
    "name": "Charlotte",
    "conference": "American",
    "aliases": [
      "North Carolina at Charlotte",
      "University of North Carolina at Charlotte"
    ]
  },
  {
    "name": "East Carolina",
    "conference": "American",
    "aliases": [
      "ECU",
      "East Carolina University"
    ]
  },
  {
    "name": "Florida Atlantic",
    "conference": "American",
    "aliases": [
      "FAU",
      "Florida Atlantic University"
    ]
  },
  {
    "name": "Memphis",
    "conference": "American",
    "aliases": [
      "U of M",
      "University of Memphis"
    ]
  },
  {
    "name": "North Texas",
    "conference": "American",
    "aliases": [
      "UNT",
      "University of North Texas"
    ]
  },
  {
    "name": "Rice",
    "conference": "American",
    "aliases": [
      "Rice University"
    ]
  },
  {
    "name": "South Florida",
    "conference": "American",
    "aliases": [
      "USF",
      "University of South Florida"
    ]
  },
  {
    "name": "Temple",
    "conference": "American",
    "aliases": [
      "Temple University"
    ]
  },
  {
    "name": "UAB",
    "conference": "American",
    "aliases": [
      "Alabama at Birmingham",
      "University of Alabama at Birmingham"
    ]
  },
  {
    "name": "UTSA",
    "conference": "American",
    "aliases": [
      "Texas at San Antonio",
      "University of Texas at San Antonio"
    ]
  },
  {
    "name": "Tulane",
    "conference": "American",
    "aliases": [
      "Tulane University"
    ]
  },
  {
    "name": "Tulsa",
    "conference": "American",
    "aliases": [
      "University of Tulsa"
    ]
  },
  {
    "name": "Wichita State",
    "conference": "American",
    "aliases": [
      "Wichita State University"
    ]
  },
  {
    "name": "Boston College",
    "conference": "ACC",
    "aliases": [
      "BC"
    ]
  },
  {
    "name": "Cal",
    "conference": "ACC",
    "aliases": [
      "California",
      "California, Berkeley",
      "University of California, Berkeley"
    ]
  },
  {
    "name": "Clemson",
    "conference": "ACC",
    "aliases": [
      "Clemson University"
    ]
  },
  {
    "name": "Duke",
    "conference": "ACC",
    "aliases": [
      "Duke University"
    ]
  },
  {
    "name": "Florida State",
    "conference": "ACC",
    "aliases": [
      "FSU",
      "Florida State University"
    ]
  },
  {
    "name": "Georgia Tech",
    "conference": "ACC",
    "aliases": [
      "Georgia Institute of Technology"
    ]
  },
  {
    "name": "Louisville",
    "conference": "ACC",
    "aliases": [
      "University of Louisville"
    ]
  },
  {
    "name": "Miami",
    "conference": "ACC",
    "aliases": [
      "Miami (FL",
      "Miami or UM)",
      "University of Miami or UM)"
    ]
  },
  {
    "name": "North Carolina",
    "conference": "ACC",
    "aliases": [
      "North Carolina at Chapel Hill",
      "UNC",
      "University of North Carolina at Chapel Hill"
    ]
  },
  {
    "name": "NC State",
    "conference": "ACC",
    "aliases": [
      "North Carolina State",
      "North Carolina State University"
    ]
  },
  {
    "name": "Notre Dame",
    "conference": "ACC",
    "aliases": [
      "University of Notre Dame"
    ]
  },
  {
    "name": "Pitt",
    "conference": "ACC",
    "aliases": [
      "Pittsburgh",
      "University of Pittsburgh"
    ]
  },
  {
    "name": "SMU",
    "conference": "ACC",
    "aliases": [
      "Southern Methodist",
      "Southern Methodist University"
    ]
  },
  {
    "name": "Stanford",
    "conference": "ACC",
    "aliases": [
      "Stanford University"
    ]
  },
  {
    "name": "Syracuse",
    "conference": "ACC",
    "aliases": [
      "Syracuse University"
    ]
  },
  {
    "name": "Virginia",
    "conference": "ACC",
    "aliases": [
      "UVA",
      "University of Virginia"
    ]
  },
  {
    "name": "Virginia Tech",
    "conference": "ACC",
    "aliases": [
      "Virginia Polytechnic Institute and State",
      "Virginia Polytechnic Institute and State University"
    ]
  },
  {
    "name": "Wake Forest",
    "conference": "ACC",
    "aliases": [
      "Wake Forest University"
    ]
  },
  {
    "name": "Bellarmine",
    "conference": "ASUN",
    "aliases": [
      "Bellarmine University"
    ]
  },
  {
    "name": "Florida Gulf Coast",
    "conference": "ASUN",
    "aliases": [
      "FGCU",
      "Florida Gulf Coast University"
    ]
  },
  {
    "name": "Jacksonville",
    "conference": "ASUN",
    "aliases": [
      "Jacksonville University"
    ]
  },
  {
    "name": "Lipscomb",
    "conference": "ASUN",
    "aliases": [
      "Lipscomb University"
    ]
  },
  {
    "name": "North Florida",
    "conference": "ASUN",
    "aliases": [
      "University of North Florida"
    ]
  },
  {
    "name": "Queens of Charlotte",
    "conference": "ASUN",
    "aliases": [
      "Queens University of Charlotte"
    ]
  },
  {
    "name": "Stetson",
    "conference": "ASUN",
    "aliases": [
      "Stetson University"
    ]
  },
  {
    "name": "West Florida",
    "conference": "ASUN",
    "aliases": [
      "University of West Florida"
    ]
  },
  {
    "name": "Davidson",
    "conference": "A-10",
    "aliases": [
      "Davidson College"
    ]
  },
  {
    "name": "Dayton",
    "conference": "A-10",
    "aliases": [
      "University of Dayton"
    ]
  },
  {
    "name": "Duquesne",
    "conference": "A-10",
    "aliases": [
      "Duquesne University"
    ]
  },
  {
    "name": "Fordham",
    "conference": "A-10",
    "aliases": [
      "Fordham University"
    ]
  },
  {
    "name": "George Mason",
    "conference": "A-10",
    "aliases": [
      "George Mason University"
    ]
  },
  {
    "name": "George Washington",
    "conference": "A-10",
    "aliases": [
      "GW",
      "George Washington University"
    ]
  },
  {
    "name": "La Salle",
    "conference": "A-10",
    "aliases": [
      "La Salle University"
    ]
  },
  {
    "name": "Loyola Chicago",
    "conference": "A-10",
    "aliases": [
      "Loyola University Chicago"
    ]
  },
  {
    "name": "Rhode Island",
    "conference": "A-10",
    "aliases": [
      "University of Rhode Island"
    ]
  },
  {
    "name": "Richmond",
    "conference": "A-10",
    "aliases": [
      "University of Richmond"
    ]
  },
  {
    "name": "St. Bonaventure",
    "conference": "A-10",
    "aliases": [
      "St. Bonaventure University"
    ]
  },
  {
    "name": "Saint Joseph's",
    "conference": "A-10",
    "aliases": [
      "Saint Joe's",
      "Saint Joseph's University"
    ]
  },
  {
    "name": "Saint Louis",
    "conference": "A-10",
    "aliases": [
      "SLU",
      "Saint Louis University"
    ]
  },
  {
    "name": "VCU",
    "conference": "A-10",
    "aliases": [
      "Virginia Commonwealth",
      "Virginia Commonwealth University"
    ]
  },
  {
    "name": "Butler",
    "conference": "Big East",
    "aliases": [
      "Butler University"
    ]
  },
  {
    "name": "Creighton",
    "conference": "Big East",
    "aliases": [
      "Creighton University"
    ]
  },
  {
    "name": "DePaul",
    "conference": "Big East",
    "aliases": [
      "DePaul University"
    ]
  },
  {
    "name": "Georgetown",
    "conference": "Big East",
    "aliases": [
      "Georgetown University"
    ]
  },
  {
    "name": "Marquette",
    "conference": "Big East",
    "aliases": [
      "Marquette University"
    ]
  },
  {
    "name": "Providence",
    "conference": "Big East",
    "aliases": [
      "Providence College"
    ]
  },
  {
    "name": "St. John's",
    "conference": "Big East",
    "aliases": [
      "St. John's University"
    ]
  },
  {
    "name": "Seton Hall",
    "conference": "Big East",
    "aliases": [
      "Seton Hall University"
    ]
  },
  {
    "name": "Connecticut",
    "conference": "Big East",
    "aliases": [
      "UConn",
      "University of Connecticut"
    ]
  },
  {
    "name": "Villanova",
    "conference": "Big East",
    "aliases": [
      "Villanova University"
    ]
  },
  {
    "name": "Xavier",
    "conference": "Big East",
    "aliases": [
      "Xavier University"
    ]
  },
  {
    "name": "Eastern Washington",
    "conference": "Big Sky",
    "aliases": [
      "Eastern Washington University"
    ]
  },
  {
    "name": "Idaho",
    "conference": "Big Sky",
    "aliases": [
      "University of Idaho"
    ]
  },
  {
    "name": "Idaho State",
    "conference": "Big Sky",
    "aliases": [
      "Idaho State University"
    ]
  },
  {
    "name": "Montana",
    "conference": "Big Sky",
    "aliases": [
      "University of Montana"
    ]
  },
  {
    "name": "Montana State",
    "conference": "Big Sky",
    "aliases": [
      "Montana State University"
    ]
  },
  {
    "name": "Northern Arizona",
    "conference": "Big Sky",
    "aliases": [
      "Northern Arizona University"
    ]
  },
  {
    "name": "Northern Colorado",
    "conference": "Big Sky",
    "aliases": [
      "University of Northern Colorado"
    ]
  },
  {
    "name": "Portland State",
    "conference": "Big Sky",
    "aliases": [
      "Portland State University"
    ]
  },
  {
    "name": "Southern Utah",
    "conference": "Big Sky",
    "aliases": [
      "Southern Utah University"
    ]
  },
  {
    "name": "Utah Tech",
    "conference": "Big Sky",
    "aliases": [
      "Utah Tech University"
    ]
  },
  {
    "name": "Weber State",
    "conference": "Big Sky",
    "aliases": [
      "Weber State University"
    ]
  },
  {
    "name": "Charleston Southern",
    "conference": "Big South",
    "aliases": [
      "Charleston Southern University"
    ]
  },
  {
    "name": "Gardner-Webb",
    "conference": "Big South",
    "aliases": [
      "Gardner\u2013Webb University"
    ]
  },
  {
    "name": "High Point",
    "conference": "Big South",
    "aliases": [
      "High Point University"
    ]
  },
  {
    "name": "Longwood",
    "conference": "Big South",
    "aliases": [
      "Longwood University"
    ]
  },
  {
    "name": "Presbyterian",
    "conference": "Big South",
    "aliases": [
      "Presbyterian College"
    ]
  },
  {
    "name": "Radford",
    "conference": "Big South",
    "aliases": [
      "Radford University"
    ]
  },
  {
    "name": "UNC Asheville",
    "conference": "Big South",
    "aliases": [
      "North Carolina at Asheville",
      "University of North Carolina at Asheville"
    ]
  },
  {
    "name": "USC Upstate",
    "conference": "Big South",
    "aliases": [
      "South Carolina Upstate",
      "University of South Carolina Upstate"
    ]
  },
  {
    "name": "Winthrop",
    "conference": "Big South",
    "aliases": [
      "Winthrop University"
    ]
  },
  {
    "name": "UCLA",
    "conference": "Big Ten",
    "aliases": [
      "California, Los Angeles",
      "University of California, Los Angeles"
    ]
  },
  {
    "name": "Illinois",
    "conference": "Big Ten",
    "aliases": [
      "Illinois Urbana\u2013Champaign",
      "U of I",
      "University of Illinois Urbana\u2013Champaign"
    ]
  },
  {
    "name": "Indiana",
    "conference": "Big Ten",
    "aliases": [
      "IU",
      "Indiana University Bloomington"
    ]
  },
  {
    "name": "Iowa",
    "conference": "Big Ten",
    "aliases": [
      "University of Iowa"
    ]
  },
  {
    "name": "Maryland",
    "conference": "Big Ten",
    "aliases": [
      "Maryland, College Park",
      "University of Maryland, College Park"
    ]
  },
  {
    "name": "Michigan",
    "conference": "Big Ten",
    "aliases": [
      "University of Michigan"
    ]
  },
  {
    "name": "Michigan State",
    "conference": "Big Ten",
    "aliases": [
      "Michigan State University"
    ]
  },
  {
    "name": "Minnesota",
    "conference": "Big Ten",
    "aliases": [
      "University of Minnesota"
    ]
  },
  {
    "name": "Nebraska",
    "conference": "Big Ten",
    "aliases": [
      "Nebraska\u2013Lincoln",
      "University of Nebraska\u2013Lincoln"
    ]
  },
  {
    "name": "Northwestern",
    "conference": "Big Ten",
    "aliases": [
      "Northwestern University"
    ]
  },
  {
    "name": "Ohio State",
    "conference": "Big Ten",
    "aliases": [
      "Ohio State University"
    ]
  },
  {
    "name": "Oregon",
    "conference": "Big Ten",
    "aliases": [
      "University of Oregon"
    ]
  },
  {
    "name": "Penn State",
    "conference": "Big Ten",
    "aliases": [
      "Pennsylvania State",
      "Pennsylvania State University"
    ]
  },
  {
    "name": "Purdue",
    "conference": "Big Ten",
    "aliases": [
      "Purdue University"
    ]
  },
  {
    "name": "Rutgers",
    "conference": "Big Ten",
    "aliases": [
      "Rutgers University\u2013New Brunswick"
    ]
  },
  {
    "name": "USC",
    "conference": "Big Ten",
    "aliases": [
      "Southern California",
      "University of Southern California"
    ]
  },
  {
    "name": "Washington",
    "conference": "Big Ten",
    "aliases": [
      "U-Dub",
      "UW",
      "University of Washington"
    ]
  },
  {
    "name": "Wisconsin",
    "conference": "Big Ten",
    "aliases": [
      "University of Wisconsin\u2013Madison",
      "Wisconsin\u2013Madison"
    ]
  },
  {
    "name": "Arizona",
    "conference": "Big 12",
    "aliases": [
      "University of Arizona"
    ]
  },
  {
    "name": "Arizona State",
    "conference": "Big 12",
    "aliases": [
      "Arizona State University"
    ]
  },
  {
    "name": "Baylor",
    "conference": "Big 12",
    "aliases": [
      "Baylor University"
    ]
  },
  {
    "name": "BYU",
    "conference": "Big 12",
    "aliases": [
      "Brigham Young",
      "Brigham Young University"
    ]
  },
  {
    "name": "UCF",
    "conference": "Big 12",
    "aliases": [
      "Central Florida",
      "University of Central Florida"
    ]
  },
  {
    "name": "Cincinnati",
    "conference": "Big 12",
    "aliases": [
      "UC",
      "University of Cincinnati"
    ]
  },
  {
    "name": "Colorado",
    "conference": "Big 12",
    "aliases": [
      "Colorado Boulder",
      "University of Colorado Boulder"
    ]
  },
  {
    "name": "Houston",
    "conference": "Big 12",
    "aliases": [
      "University of Houston"
    ]
  },
  {
    "name": "Iowa State",
    "conference": "Big 12",
    "aliases": [
      "Iowa State University"
    ]
  },
  {
    "name": "Kansas",
    "conference": "Big 12",
    "aliases": [
      "University of Kansas"
    ]
  },
  {
    "name": "Kansas State",
    "conference": "Big 12",
    "aliases": [
      "Kansas State University"
    ]
  },
  {
    "name": "Oklahoma State",
    "conference": "Big 12",
    "aliases": [
      "Oklahoma State University\u2013Stillwater"
    ]
  },
  {
    "name": "TCU",
    "conference": "Big 12",
    "aliases": [
      "Texas Christian",
      "Texas Christian University"
    ]
  },
  {
    "name": "Texas Tech",
    "conference": "Big 12",
    "aliases": [
      "Texas Tech University"
    ]
  },
  {
    "name": "Utah",
    "conference": "Big 12",
    "aliases": [
      "University of Utah"
    ]
  },
  {
    "name": "West Virginia",
    "conference": "Big 12",
    "aliases": [
      "WVU",
      "West Virginia University"
    ]
  },
  {
    "name": "California Baptist",
    "conference": "Big West",
    "aliases": [
      "CBU",
      "California Baptist University"
    ]
  },
  {
    "name": "Cal Poly",
    "conference": "Big West",
    "aliases": [
      "California Polytechnic State",
      "California Polytechnic State University"
    ]
  },
  {
    "name": "CSU Bakersfield",
    "conference": "Big West",
    "aliases": [
      "Cal State Bakersfield",
      "California State University, Bakersfield"
    ]
  },
  {
    "name": "Cal State Fullerton",
    "conference": "Big West",
    "aliases": [
      "California State University, Fullerton"
    ]
  },
  {
    "name": "Cal State Northridge",
    "conference": "Big West",
    "aliases": [
      "CSUN",
      "California State University, Northridge"
    ]
  },
  {
    "name": "Long Beach State",
    "conference": "Big West",
    "aliases": [
      "California State University, Long Beach"
    ]
  },
  {
    "name": "Sacramento State",
    "conference": "Big West",
    "aliases": [
      "California State University, Sacramento"
    ]
  },
  {
    "name": "UC Irvine",
    "conference": "Big West",
    "aliases": [
      "California, Irvine",
      "University of California, Irvine"
    ]
  },
  {
    "name": "UC Riverside",
    "conference": "Big West",
    "aliases": [
      "California, Riverside",
      "University of California, Riverside"
    ]
  },
  {
    "name": "UC San Diego",
    "conference": "Big West",
    "aliases": [
      "California, San Diego",
      "UCSD",
      "University of California, San Diego"
    ]
  },
  {
    "name": "UC Santa Barbara",
    "conference": "Big West",
    "aliases": [
      "California, Santa Barbara",
      "UCSB",
      "University of California, Santa Barbara"
    ]
  },
  {
    "name": "Utah Valley",
    "conference": "Big West",
    "aliases": [
      "Utah Valley University"
    ]
  },
  {
    "name": "Campbell",
    "conference": "CAA",
    "aliases": [
      "Campbell University"
    ]
  },
  {
    "name": "Charleston",
    "conference": "CAA",
    "aliases": [
      "College of Charleston"
    ]
  },
  {
    "name": "Drexel",
    "conference": "CAA",
    "aliases": [
      "Drexel University"
    ]
  },
  {
    "name": "Elon",
    "conference": "CAA",
    "aliases": [
      "Elon University"
    ]
  },
  {
    "name": "Hampton",
    "conference": "CAA",
    "aliases": [
      "Hampton University"
    ]
  },
  {
    "name": "Hofstra",
    "conference": "CAA",
    "aliases": [
      "Hofstra University"
    ]
  },
  {
    "name": "Monmouth",
    "conference": "CAA",
    "aliases": [
      "Monmouth University"
    ]
  },
  {
    "name": "North Carolina A&T",
    "conference": "CAA",
    "aliases": [
      "North Carolina Agricultural and Technical State",
      "North Carolina Agricultural and Technical State University"
    ]
  },
  {
    "name": "Northeastern",
    "conference": "CAA",
    "aliases": [
      "Northeastern University"
    ]
  },
  {
    "name": "Stony Brook",
    "conference": "CAA",
    "aliases": [
      "Stony Brook University"
    ]
  },
  {
    "name": "Towson",
    "conference": "CAA",
    "aliases": [
      "Towson University"
    ]
  },
  {
    "name": "UNCW",
    "conference": "CAA",
    "aliases": [
      "North Carolina at Wilmington",
      "UNC Wilmington",
      "University of North Carolina at Wilmington"
    ]
  },
  {
    "name": "William & Mary",
    "conference": "CAA",
    "aliases": [
      "College of William & Mary"
    ]
  },
  {
    "name": "Delaware",
    "conference": "Conference USA",
    "aliases": [
      "University of Delaware"
    ]
  },
  {
    "name": "FIU",
    "conference": "Conference USA",
    "aliases": [
      "Florida International",
      "Florida International University"
    ]
  },
  {
    "name": "Jacksonville State",
    "conference": "Conference USA",
    "aliases": [
      "Jacksonville State University"
    ]
  },
  {
    "name": "Kennesaw State",
    "conference": "Conference USA",
    "aliases": [
      "Kennesaw State University"
    ]
  },
  {
    "name": "Liberty",
    "conference": "Conference USA",
    "aliases": [
      "Liberty University"
    ]
  },
  {
    "name": "Middle Tennessee",
    "conference": "Conference USA",
    "aliases": [
      "MTSU",
      "Middle Tennessee State",
      "Middle Tennessee State University"
    ]
  },
  {
    "name": "Missouri State",
    "conference": "Conference USA",
    "aliases": [
      "Missouri State University"
    ]
  },
  {
    "name": "New Mexico State",
    "conference": "Conference USA",
    "aliases": [
      "New Mexico State University"
    ]
  },
  {
    "name": "Sam Houston State",
    "conference": "Conference USA",
    "aliases": [
      "Sam Houston",
      "Sam Houston State University"
    ]
  },
  {
    "name": "Western Kentucky",
    "conference": "Conference USA",
    "aliases": [
      "WKU",
      "Western Kentucky University"
    ]
  },
  {
    "name": "Cleveland State",
    "conference": "Horizon League",
    "aliases": [
      "Cleveland State University"
    ]
  },
  {
    "name": "Detroit Mercy",
    "conference": "Horizon League",
    "aliases": [
      "University of Detroit Mercy"
    ]
  },
  {
    "name": "IU Indy",
    "conference": "Horizon League",
    "aliases": [
      "Indiana University Indianapolis"
    ]
  },
  {
    "name": "Milwaukee",
    "conference": "Horizon League",
    "aliases": [
      "University of Wisconsin-Milwaukee",
      "Wisconsin-Milwaukee"
    ]
  },
  {
    "name": "Northern Illinois",
    "conference": "Horizon League",
    "aliases": [
      "NIU",
      "Northern Illinois University"
    ]
  },
  {
    "name": "Northern Kentucky",
    "conference": "Horizon League",
    "aliases": [
      "NKU",
      "Northern Kentucky University"
    ]
  },
  {
    "name": "Oakland",
    "conference": "Horizon League",
    "aliases": [
      "Oakland University"
    ]
  },
  {
    "name": "Purdue Fort Wayne",
    "conference": "Horizon League",
    "aliases": [
      "Purdue University Fort Wayne"
    ]
  },
  {
    "name": "Robert Morris",
    "conference": "Horizon League",
    "aliases": [
      "Robert Morris University"
    ]
  },
  {
    "name": "Green Bay",
    "conference": "Horizon League",
    "aliases": [
      "University of Wisconsin\u2013Green Bay",
      "Wisconsin\u2013Green Bay"
    ]
  },
  {
    "name": "Wright State",
    "conference": "Horizon League",
    "aliases": [
      "Wright State University"
    ]
  },
  {
    "name": "Youngstown State",
    "conference": "Horizon League",
    "aliases": [
      "Youngstown State University"
    ]
  },
  {
    "name": "Brown",
    "conference": "Ivy League",
    "aliases": [
      "Brown University"
    ]
  },
  {
    "name": "Columbia",
    "conference": "Ivy League",
    "aliases": [
      "Columbia University"
    ]
  },
  {
    "name": "Cornell",
    "conference": "Ivy League",
    "aliases": [
      "Cornell University"
    ]
  },
  {
    "name": "Dartmouth",
    "conference": "Ivy League",
    "aliases": [
      "Dartmouth College"
    ]
  },
  {
    "name": "Harvard",
    "conference": "Ivy League",
    "aliases": [
      "Harvard University"
    ]
  },
  {
    "name": "Pennsylvania",
    "conference": "Ivy League",
    "aliases": [
      "Penn",
      "University of Pennsylvania"
    ]
  },
  {
    "name": "Princeton",
    "conference": "Ivy League",
    "aliases": [
      "Princeton University"
    ]
  },
  {
    "name": "Yale",
    "conference": "Ivy League",
    "aliases": [
      "Yale University"
    ]
  },
  {
    "name": "Canisius",
    "conference": "MAAC",
    "aliases": [
      "Canisius University"
    ]
  },
  {
    "name": "Fairfield",
    "conference": "MAAC",
    "aliases": [
      "Fairfield University"
    ]
  },
  {
    "name": "Iona",
    "conference": "MAAC",
    "aliases": [
      "Iona University"
    ]
  },
  {
    "name": "Manhattan",
    "conference": "MAAC",
    "aliases": [
      "Manhattan University"
    ]
  },
  {
    "name": "Marist",
    "conference": "MAAC",
    "aliases": [
      "Marist University"
    ]
  },
  {
    "name": "Merrimack",
    "conference": "MAAC",
    "aliases": [
      "Merrimack College"
    ]
  },
  {
    "name": "Mount St. Mary's",
    "conference": "MAAC",
    "aliases": [
      "Mount St. Mary's University"
    ]
  },
  {
    "name": "Niagara",
    "conference": "MAAC",
    "aliases": [
      "Niagara University"
    ]
  },
  {
    "name": "Quinnipiac",
    "conference": "MAAC",
    "aliases": [
      "Quinnipiac University"
    ]
  },
  {
    "name": "Rider",
    "conference": "MAAC",
    "aliases": [
      "Rider University"
    ]
  },
  {
    "name": "Sacred Heart",
    "conference": "MAAC",
    "aliases": [
      "Sacred Heart University"
    ]
  },
  {
    "name": "Saint Peter's",
    "conference": "MAAC",
    "aliases": [
      "Saint Peter's University"
    ]
  },
  {
    "name": "Siena",
    "conference": "MAAC",
    "aliases": [
      "Siena University"
    ]
  },
  {
    "name": "Akron",
    "conference": "MAC",
    "aliases": [
      "University of Akron"
    ]
  },
  {
    "name": "Ball State",
    "conference": "MAC",
    "aliases": [
      "Ball State University"
    ]
  },
  {
    "name": "Bowling Green",
    "conference": "MAC",
    "aliases": [
      "Bowling Green State",
      "Bowling Green State University"
    ]
  },
  {
    "name": "Buffalo",
    "conference": "MAC",
    "aliases": [
      "University at Buffalo"
    ]
  },
  {
    "name": "Central Michigan",
    "conference": "MAC",
    "aliases": [
      "Central Michigan University"
    ]
  },
  {
    "name": "Eastern Michigan",
    "conference": "MAC",
    "aliases": [
      "Eastern Michigan University"
    ]
  },
  {
    "name": "Kent State",
    "conference": "MAC",
    "aliases": [
      "Kent State University"
    ]
  },
  {
    "name": "UMass",
    "conference": "MAC",
    "aliases": [
      "Massachusetts Amherst",
      "University of Massachusetts Amherst"
    ]
  },
  {
    "name": "Miami (OH)",
    "conference": "MAC",
    "aliases": [
      "Miami University)"
    ]
  },
  {
    "name": "Ohio",
    "conference": "MAC",
    "aliases": [
      "Ohio University"
    ]
  },
  {
    "name": "Toledo",
    "conference": "MAC",
    "aliases": [
      "University of Toledo"
    ]
  },
  {
    "name": "Western Michigan",
    "conference": "MAC",
    "aliases": [
      "Western Michigan University"
    ]
  },
  {
    "name": "Coppin State",
    "conference": "MEAC",
    "aliases": [
      "Coppin State University"
    ]
  },
  {
    "name": "Delaware State",
    "conference": "MEAC",
    "aliases": [
      "Delaware State University"
    ]
  },
  {
    "name": "Howard",
    "conference": "MEAC",
    "aliases": [
      "Howard University"
    ]
  },
  {
    "name": "UMES",
    "conference": "MEAC",
    "aliases": [
      "Maryland Eastern Shore",
      "University of Maryland Eastern Shore"
    ]
  },
  {
    "name": "Morgan State",
    "conference": "MEAC",
    "aliases": [
      "Morgan State University"
    ]
  },
  {
    "name": "Norfolk State",
    "conference": "MEAC",
    "aliases": [
      "Norfolk State University"
    ]
  },
  {
    "name": "NCCU",
    "conference": "MEAC",
    "aliases": [
      "North Carolina Central",
      "North Carolina Central University"
    ]
  },
  {
    "name": "SC State",
    "conference": "MEAC",
    "aliases": [
      "South Carolina State",
      "South Carolina State University"
    ]
  },
  {
    "name": "Belmont",
    "conference": "Missouri Valley",
    "aliases": [
      "Belmont University"
    ]
  },
  {
    "name": "Bradley",
    "conference": "Missouri Valley",
    "aliases": [
      "Bradley University"
    ]
  },
  {
    "name": "Drake",
    "conference": "Missouri Valley",
    "aliases": [
      "Drake University"
    ]
  },
  {
    "name": "Evansville",
    "conference": "Missouri Valley",
    "aliases": [
      "University of Evansville"
    ]
  },
  {
    "name": "Illinois State",
    "conference": "Missouri Valley",
    "aliases": [
      "Illinois State University"
    ]
  },
  {
    "name": "Indiana State",
    "conference": "Missouri Valley",
    "aliases": [
      "Indiana State University"
    ]
  },
  {
    "name": "Murray State",
    "conference": "Missouri Valley",
    "aliases": [
      "Murray State University"
    ]
  },
  {
    "name": "Northern Iowa",
    "conference": "Missouri Valley",
    "aliases": [
      "UNI",
      "University of Northern Iowa"
    ]
  },
  {
    "name": "Southern Illinois",
    "conference": "Missouri Valley",
    "aliases": [
      "SIU",
      "Southern Illinois University Carbondale"
    ]
  },
  {
    "name": "Illinois Chicago",
    "conference": "Missouri Valley",
    "aliases": [
      "UIC",
      "University of Illinois Chicago"
    ]
  },
  {
    "name": "Valparaiso",
    "conference": "Missouri Valley",
    "aliases": [
      "Valparaiso University",
      "Valpo"
    ]
  },
  {
    "name": "Air Force",
    "conference": "Mountain West",
    "aliases": [
      "United States Air Force Academy"
    ]
  },
  {
    "name": "Grand Canyon",
    "conference": "Mountain West",
    "aliases": [
      "Grand Canyon University"
    ]
  },
  {
    "name": "Hawaii",
    "conference": "Mountain West",
    "aliases": [
      "Hawai\u02bbi at M\u0101noa",
      "University of Hawai\u02bbi at M\u0101noa"
    ]
  },
  {
    "name": "Nevada",
    "conference": "Mountain West",
    "aliases": [
      "Nevada, Reno",
      "UNR",
      "University of Nevada, Reno"
    ]
  },
  {
    "name": "New Mexico",
    "conference": "Mountain West",
    "aliases": [
      "UNM",
      "University of New Mexico"
    ]
  },
  {
    "name": "San Jose State",
    "conference": "Mountain West",
    "aliases": [
      "San Jose State University"
    ]
  },
  {
    "name": "UC Davis",
    "conference": "Mountain West",
    "aliases": [
      "California, Davis",
      "University of California, Davis"
    ]
  },
  {
    "name": "UNLV",
    "conference": "Mountain West",
    "aliases": [
      "Nevada, Las Vegas",
      "University of Nevada, Las Vegas"
    ]
  },
  {
    "name": "UTEP",
    "conference": "Mountain West",
    "aliases": [
      "Texas at El Paso",
      "University of Texas at El Paso"
    ]
  },
  {
    "name": "Wyoming",
    "conference": "Mountain West",
    "aliases": [
      "University of Wyoming"
    ]
  },
  {
    "name": "Central Connecticut",
    "conference": "NEC",
    "aliases": [
      "Central Connecticut State",
      "Central Connecticut State University"
    ]
  },
  {
    "name": "Chicago State",
    "conference": "NEC",
    "aliases": [
      "Chicago State University"
    ]
  },
  {
    "name": "Fairleigh Dickinson",
    "conference": "NEC",
    "aliases": [
      "Fairleigh Dickinson University"
    ]
  },
  {
    "name": "Le Moyne",
    "conference": "NEC",
    "aliases": [
      "Le Moyne College"
    ]
  },
  {
    "name": "Long Island",
    "conference": "NEC",
    "aliases": [
      "LIU",
      "Long Island University"
    ]
  },
  {
    "name": "Mercyhurst",
    "conference": "NEC",
    "aliases": [
      "Mercyhurst University"
    ]
  },
  {
    "name": "New Haven",
    "conference": "NEC",
    "aliases": [
      "University of New Haven"
    ]
  },
  {
    "name": "Stonehill",
    "conference": "NEC",
    "aliases": [
      "Stonehill College"
    ]
  },
  {
    "name": "Wagner",
    "conference": "NEC",
    "aliases": [
      "Wagner College"
    ]
  },
  {
    "name": "Eastern Illinois",
    "conference": "Ohio Valley",
    "aliases": [
      "Eastern Illinois University"
    ]
  },
  {
    "name": "Lindenwood",
    "conference": "Ohio Valley",
    "aliases": [
      "Lindenwood University"
    ]
  },
  {
    "name": "Morehead State",
    "conference": "Ohio Valley",
    "aliases": [
      "Morehead State University"
    ]
  },
  {
    "name": "Southeast Missouri",
    "conference": "Ohio Valley",
    "aliases": [
      "SEMO",
      "Southeast Missouri State",
      "Southeast Missouri State University"
    ]
  },
  {
    "name": "SIU Edwardsville",
    "conference": "Ohio Valley",
    "aliases": [
      "SIUE",
      "Southern Illinois University Edwardsville"
    ]
  },
  {
    "name": "Southern Indiana",
    "conference": "Ohio Valley",
    "aliases": [
      "University of Southern Indiana"
    ]
  },
  {
    "name": "UT Martin",
    "conference": "Ohio Valley",
    "aliases": [
      "Tennessee at Martin",
      "University of Tennessee at Martin"
    ]
  },
  {
    "name": "Tennessee State",
    "conference": "Ohio Valley",
    "aliases": [
      "Tennessee State University"
    ]
  },
  {
    "name": "Western Illinois",
    "conference": "Ohio Valley",
    "aliases": [
      "Western Illinois University"
    ]
  },
  {
    "name": "Boise State",
    "conference": "Pac-12",
    "aliases": [
      "Boise State University"
    ]
  },
  {
    "name": "Colorado State",
    "conference": "Pac-12",
    "aliases": [
      "Colorado State University"
    ]
  },
  {
    "name": "Fresno State",
    "conference": "Pac-12",
    "aliases": [
      "California State University, Fresno"
    ]
  },
  {
    "name": "Gonzaga",
    "conference": "Pac-12",
    "aliases": [
      "Gonzaga University"
    ]
  },
  {
    "name": "Oregon State",
    "conference": "Pac-12",
    "aliases": [
      "Oregon State University"
    ]
  },
  {
    "name": "San Diego State",
    "conference": "Pac-12",
    "aliases": [
      "SDSU",
      "San Diego State University"
    ]
  },
  {
    "name": "Texas State",
    "conference": "Pac-12",
    "aliases": [
      "Texas State University"
    ]
  },
  {
    "name": "Utah State",
    "conference": "Pac-12",
    "aliases": [
      "Utah State University"
    ]
  },
  {
    "name": "Washington State",
    "conference": "Pac-12",
    "aliases": [
      "Washington State University"
    ]
  },
  {
    "name": "American",
    "conference": "Patriot League",
    "aliases": [
      "American University"
    ]
  },
  {
    "name": "Army",
    "conference": "Patriot League",
    "aliases": [
      "Army West Point",
      "United States Military Academy"
    ]
  },
  {
    "name": "Boston",
    "conference": "Patriot League",
    "aliases": [
      "Boston University"
    ]
  },
  {
    "name": "Bucknell",
    "conference": "Patriot League",
    "aliases": [
      "Bucknell University"
    ]
  },
  {
    "name": "Colgate",
    "conference": "Patriot League",
    "aliases": [
      "Colgate University"
    ]
  },
  {
    "name": "Holy Cross",
    "conference": "Patriot League",
    "aliases": [
      "College of the Holy Cross"
    ]
  },
  {
    "name": "Lafayette",
    "conference": "Patriot League",
    "aliases": [
      "Lafayette College"
    ]
  },
  {
    "name": "Lehigh",
    "conference": "Patriot League",
    "aliases": [
      "Lehigh University"
    ]
  },
  {
    "name": "Loyola Maryland",
    "conference": "Patriot League",
    "aliases": [
      "Loyola University Maryland"
    ]
  },
  {
    "name": "Navy",
    "conference": "Patriot League",
    "aliases": [
      "United States Naval Academy"
    ]
  },
  {
    "name": "Alabama",
    "conference": "SEC",
    "aliases": [
      "University of Alabama"
    ]
  },
  {
    "name": "Arkansas",
    "conference": "SEC",
    "aliases": [
      "University of Arkansas"
    ]
  },
  {
    "name": "Auburn",
    "conference": "SEC",
    "aliases": [
      "Auburn University"
    ]
  },
  {
    "name": "Florida",
    "conference": "SEC",
    "aliases": [
      "University of Florida"
    ]
  },
  {
    "name": "Georgia",
    "conference": "SEC",
    "aliases": [
      "UGA",
      "University of Georgia"
    ]
  },
  {
    "name": "Kentucky",
    "conference": "SEC",
    "aliases": [
      "UK",
      "University of Kentucky"
    ]
  },
  {
    "name": "LSU",
    "conference": "SEC",
    "aliases": [
      "Louisiana State",
      "Louisiana State University"
    ]
  },
  {
    "name": "Ole Miss",
    "conference": "SEC",
    "aliases": [
      "Mississippi",
      "University of Mississippi"
    ]
  },
  {
    "name": "Mississippi State",
    "conference": "SEC",
    "aliases": [
      "Mississippi State University"
    ]
  },
  {
    "name": "Missouri",
    "conference": "SEC",
    "aliases": [
      "Mizzou",
      "University of Missouri"
    ]
  },
  {
    "name": "Oklahoma",
    "conference": "SEC",
    "aliases": [
      "University of Oklahoma"
    ]
  },
  {
    "name": "South Carolina",
    "conference": "SEC",
    "aliases": [
      "University of South Carolina"
    ]
  },
  {
    "name": "Tennessee",
    "conference": "SEC",
    "aliases": [
      "University of Tennessee"
    ]
  },
  {
    "name": "Texas",
    "conference": "SEC",
    "aliases": [
      "Texas at Austin",
      "University of Texas at Austin"
    ]
  },
  {
    "name": "Texas A&M",
    "conference": "SEC",
    "aliases": [
      "Texas A&M University"
    ]
  },
  {
    "name": "Vanderbilt",
    "conference": "SEC",
    "aliases": [
      "Vanderbilt University",
      "Vandy"
    ]
  },
  {
    "name": "Chattanooga",
    "conference": "Southern",
    "aliases": [
      "Tennessee at Chattanooga",
      "University of Tennessee at Chattanooga"
    ]
  },
  {
    "name": "Citadel",
    "conference": "Southern",
    "aliases": [
      "The Citadel"
    ]
  },
  {
    "name": "ETSU",
    "conference": "Southern",
    "aliases": [
      "East Tennessee State",
      "East Tennessee State University"
    ]
  },
  {
    "name": "Furman",
    "conference": "Southern",
    "aliases": [
      "Furman University"
    ]
  },
  {
    "name": "Mercer",
    "conference": "Southern",
    "aliases": [
      "Mercer University"
    ]
  },
  {
    "name": "Samford",
    "conference": "Southern",
    "aliases": [
      "Samford University"
    ]
  },
  {
    "name": "Tennessee Tech",
    "conference": "Southern",
    "aliases": [
      "Tennessee Tech University"
    ]
  },
  {
    "name": "UNCG",
    "conference": "Southern",
    "aliases": [
      "North Carolina at Greensboro",
      "UNC Greensboro",
      "University of North Carolina at Greensboro"
    ]
  },
  {
    "name": "VMI",
    "conference": "Southern",
    "aliases": [
      "Virginia Military Institute"
    ]
  },
  {
    "name": "Western Carolina",
    "conference": "Southern",
    "aliases": [
      "Western Carolina University"
    ]
  },
  {
    "name": "Wofford",
    "conference": "Southern",
    "aliases": [
      "Wofford College"
    ]
  },
  {
    "name": "East Texas A&M",
    "conference": "Southland",
    "aliases": [
      "East Texas A&M University"
    ]
  },
  {
    "name": "Houston Christian",
    "conference": "Southland",
    "aliases": [
      "HCU",
      "Houston Christian University"
    ]
  },
  {
    "name": "Incarnate Word",
    "conference": "Southland",
    "aliases": [
      "UIW",
      "University of the Incarnate Word",
      "the Incarnate Word"
    ]
  },
  {
    "name": "Lamar",
    "conference": "Southland",
    "aliases": [
      "Lamar University"
    ]
  },
  {
    "name": "LSU New Orleans",
    "conference": "Southland"
  },
  {
    "name": "McNeese State",
    "conference": "Southland",
    "aliases": [
      "McNeese",
      "McNeese State University"
    ]
  },
  {
    "name": "Nicholls State",
    "conference": "Southland",
    "aliases": [
      "Nicholls",
      "Nicholls State University"
    ]
  },
  {
    "name": "Northwestern State",
    "conference": "Southland",
    "aliases": [
      "Northwestern State University"
    ]
  },
  {
    "name": "Southeastern Louisiana",
    "conference": "Southland",
    "aliases": [
      "Southeastern Louisiana University"
    ]
  },
  {
    "name": "Stephen F. Austin",
    "conference": "Southland",
    "aliases": [
      "SFA",
      "Stephen F. Austin State",
      "Stephen F. Austin State University"
    ]
  },
  {
    "name": "Texas A&M-Corpus Christi",
    "conference": "Southland",
    "aliases": [
      "Texas A&M University-Corpus Christi"
    ]
  },
  {
    "name": "UTRGV",
    "conference": "Southland",
    "aliases": [
      "Texas Rio Grande Valley",
      "University of Texas Rio Grande Valley"
    ]
  },
  {
    "name": "Alabama A&M",
    "conference": "SWAC",
    "aliases": [
      "Alabama Agricultural and Mechanical",
      "Alabama Agricultural and Mechanical University"
    ]
  },
  {
    "name": "Alabama State",
    "conference": "SWAC",
    "aliases": [
      "Alabama State University"
    ]
  },
  {
    "name": "Alcorn State",
    "conference": "SWAC",
    "aliases": [
      "Alcorn State University"
    ]
  },
  {
    "name": "Arkansas-Pine Bluff",
    "conference": "SWAC",
    "aliases": [
      "Arkansas at Pine Bluff",
      "UAPB",
      "University of Arkansas at Pine Bluff"
    ]
  },
  {
    "name": "Bethune-Cookman",
    "conference": "SWAC",
    "aliases": [
      "Bethune\u2013Cookman University"
    ]
  },
  {
    "name": "Florida A&M",
    "conference": "SWAC",
    "aliases": [
      "FAMU",
      "Florida Agricultural and Mechanical",
      "Florida Agricultural and Mechanical University"
    ]
  },
  {
    "name": "Grambling State",
    "conference": "SWAC",
    "aliases": [
      "Grambling State University"
    ]
  },
  {
    "name": "Jackson State",
    "conference": "SWAC",
    "aliases": [
      "Jackson State University"
    ]
  },
  {
    "name": "Mississippi Valley State",
    "conference": "SWAC",
    "aliases": [
      "Mississippi Valley State University"
    ]
  },
  {
    "name": "Prairie View A&M",
    "conference": "SWAC",
    "aliases": [
      "Prairie View A&M University"
    ]
  },
  {
    "name": "Southern",
    "conference": "SWAC",
    "aliases": [
      "Southern University"
    ]
  },
  {
    "name": "Texas Southern",
    "conference": "SWAC",
    "aliases": [
      "Texas Southern University"
    ]
  },
  {
    "name": "Kansas City",
    "conference": "The Summit",
    "aliases": [
      "Missouri\u2013Kansas City",
      "University of Missouri\u2013Kansas City"
    ]
  },
  {
    "name": "North Dakota",
    "conference": "The Summit",
    "aliases": [
      "University of North Dakota"
    ]
  },
  {
    "name": "North Dakota State",
    "conference": "The Summit",
    "aliases": [
      "NDSU",
      "North Dakota State University"
    ]
  },
  {
    "name": "Nebraska Omaha",
    "conference": "The Summit",
    "aliases": [
      "Omaha",
      "University of Nebraska Omaha"
    ]
  },
  {
    "name": "Oral Roberts",
    "conference": "The Summit",
    "aliases": [
      "Oral Roberts University"
    ]
  },
  {
    "name": "St. Thomas",
    "conference": "The Summit",
    "aliases": [
      "University of St. Thomas"
    ]
  },
  {
    "name": "South Dakota",
    "conference": "The Summit",
    "aliases": [
      "University of South Dakota"
    ]
  },
  {
    "name": "South Dakota State",
    "conference": "The Summit",
    "aliases": [
      "South Dakota State University"
    ]
  },
  {
    "name": "Appalachian State",
    "conference": "Sun Belt",
    "aliases": [
      "Appalachian State University"
    ]
  },
  {
    "name": "Arkansas State",
    "conference": "Sun Belt",
    "aliases": [
      "Arkansas State University"
    ]
  },
  {
    "name": "Coastal Carolina",
    "conference": "Sun Belt",
    "aliases": [
      "Coastal Carolina University"
    ]
  },
  {
    "name": "Georgia Southern",
    "conference": "Sun Belt",
    "aliases": [
      "Georgia Southern University"
    ]
  },
  {
    "name": "Georgia State",
    "conference": "Sun Belt",
    "aliases": [
      "Georgia State University"
    ]
  },
  {
    "name": "James Madison",
    "conference": "Sun Belt",
    "aliases": [
      "JMU",
      "James Madison University"
    ]
  },
  {
    "name": "Louisiana",
    "conference": "Sun Belt",
    "aliases": [
      "Louisiana at Lafayette",
      "University of Louisiana at Lafayette"
    ]
  },
  {
    "name": "Louisiana-Monroe",
    "conference": "Sun Belt",
    "aliases": [
      "Louisiana at Monroe",
      "ULM",
      "University of Louisiana at Monroe"
    ]
  },
  {
    "name": "Louisiana Tech",
    "conference": "Sun Belt",
    "aliases": [
      "Louisiana Tech University",
      "alternately LA Tech"
    ]
  },
  {
    "name": "Marshall",
    "conference": "Sun Belt",
    "aliases": [
      "Marshall University"
    ]
  },
  {
    "name": "Old Dominion",
    "conference": "Sun Belt",
    "aliases": [
      "Old Dominion University"
    ]
  },
  {
    "name": "South Alabama",
    "conference": "Sun Belt",
    "aliases": [
      "University of South Alabama"
    ]
  },
  {
    "name": "Southern Miss",
    "conference": "Sun Belt",
    "aliases": [
      "Southern Mississippi",
      "University of Southern Mississippi"
    ]
  },
  {
    "name": "Troy",
    "conference": "Sun Belt",
    "aliases": [
      "Troy University"
    ]
  },
  {
    "name": "Abilene Christian",
    "conference": "UAC",
    "aliases": [
      "Abilene Christian University"
    ]
  },
  {
    "name": "Austin Peay State",
    "conference": "UAC",
    "aliases": [
      "Austin Peay",
      "Austin Peay State University"
    ]
  },
  {
    "name": "Central Arkansas",
    "conference": "UAC",
    "aliases": [
      "University of Central Arkansas"
    ]
  },
  {
    "name": "Eastern Kentucky",
    "conference": "UAC",
    "aliases": [
      "Eastern Kentucky University"
    ]
  },
  {
    "name": "Little Rock",
    "conference": "UAC",
    "aliases": [
      "Arkansas at Little Rock",
      "University of Arkansas at Little Rock"
    ]
  },
  {
    "name": "North Alabama",
    "conference": "UAC",
    "aliases": [
      "University of North Alabama"
    ]
  },
  {
    "name": "Tarleton State",
    "conference": "UAC",
    "aliases": [
      "Tarleton State University",
      "alternately Tarleton"
    ]
  },
  {
    "name": "UT Arlington",
    "conference": "UAC",
    "aliases": [
      "Texas at Arlington",
      "University of Texas at Arlington"
    ]
  },
  {
    "name": "West Georgia",
    "conference": "UAC",
    "aliases": [
      "University of West Georgia"
    ]
  },
  {
    "name": "Denver",
    "conference": "West Coast",
    "aliases": [
      "University of Denver"
    ]
  },
  {
    "name": "Loyola Marymount",
    "conference": "West Coast",
    "aliases": [
      "Loyola Marymount University"
    ]
  },
  {
    "name": "Pacific",
    "conference": "West Coast",
    "aliases": [
      "University of the Pacific",
      "the Pacific"
    ]
  },
  {
    "name": "Pepperdine",
    "conference": "West Coast",
    "aliases": [
      "Pepperdine University"
    ]
  },
  {
    "name": "Portland",
    "conference": "West Coast",
    "aliases": [
      "University of Portland"
    ]
  },
  {
    "name": "Saint Mary's",
    "conference": "West Coast",
    "aliases": [
      "Saint Mary's College of California"
    ]
  },
  {
    "name": "San Diego",
    "conference": "West Coast",
    "aliases": [
      "University of San Diego"
    ]
  },
  {
    "name": "San Francisco",
    "conference": "West Coast",
    "aliases": [
      "University of San Francisco"
    ]
  },
  {
    "name": "Santa Clara",
    "conference": "West Coast",
    "aliases": [
      "Santa Clara University"
    ]
  },
  {
    "name": "Seattle",
    "conference": "West Coast",
    "aliases": [
      "Seattle University"
    ]
  }
];

if (typeof module !== "undefined" && module.exports) module.exports = TeamsMaster;
else if (typeof window !== "undefined") window.TeamsMaster = TeamsMaster;
