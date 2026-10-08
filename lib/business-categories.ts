export type BusinessCategory={id:string;label:string;tags:string[]};
export const businessCategories:BusinessCategory[] = [
  {
    "id": "clinics",
    "label": "Clinics, doctors, dentists & hospitals",
    "tags": [
      "amenity:clinic",
      "amenity:doctors",
      "amenity:dentist",
      "amenity:hospital"
    ]
  },
  {
    "id": "pharmacies",
    "label": "Pharmacies & medical stores",
    "tags": [
      "amenity:pharmacy",
      "shop:medical_supply"
    ]
  },
  {
    "id": "labs",
    "label": "Diagnostic labs & healthcare services",
    "tags": [
      "healthcare:laboratory",
      "healthcare:physiotherapist",
      "healthcare:centre"
    ]
  },
  {
    "id": "retail",
    "label": "Retail shops & supermarkets",
    "tags": [
      "shop:supermarket",
      "shop:convenience",
      "shop:department_store",
      "shop:general",
      "shop:mall"
    ]
  },
  {
    "id": "wholesale",
    "label": "Wholesalers & distributors",
    "tags": [
      "shop:wholesale",
      "shop:trade"
    ]
  },
  {
    "id": "jewellers",
    "label": "Jewellers & luxury retailers",
    "tags": [
      "shop:jewelry",
      "shop:watches"
    ]
  },
  {
    "id": "fashion",
    "label": "Fashion, footwear & accessories",
    "tags": [
      "shop:clothes",
      "shop:shoes",
      "shop:bag",
      "shop:tailor"
    ]
  },
  {
    "id": "electronics",
    "label": "Electronics, mobile & computer stores",
    "tags": [
      "shop:electronics",
      "shop:mobile_phone",
      "shop:computer"
    ]
  },
  {
    "id": "furniture",
    "label": "Furniture, interiors & home decor",
    "tags": [
      "shop:furniture",
      "shop:interior_decoration",
      "shop:kitchen",
      "shop:houseware"
    ]
  },
  {
    "id": "foodshops",
    "label": "Bakeries, grocery & food retailers",
    "tags": [
      "shop:bakery",
      "shop:butcher",
      "shop:greengrocer",
      "shop:confectionery"
    ]
  },
  {
    "id": "restaurants",
    "label": "Restaurants, caf\u00e9s & food outlets",
    "tags": [
      "amenity:restaurant",
      "amenity:cafe",
      "amenity:fast_food",
      "amenity:food_court"
    ]
  },
  {
    "id": "hotels",
    "label": "Hotels, resorts & guest houses",
    "tags": [
      "tourism:hotel",
      "tourism:guest_house",
      "tourism:motel",
      "tourism:hostel"
    ]
  },
  {
    "id": "salons",
    "label": "Salons, spas & beauty businesses",
    "tags": [
      "shop:hairdresser",
      "shop:beauty",
      "shop:massage",
      "leisure:spa"
    ]
  },
  {
    "id": "fitness",
    "label": "Gyms, yoga & fitness centres",
    "tags": [
      "leisure:fitness_centre",
      "leisure:sports_centre"
    ]
  },
  {
    "id": "realestate",
    "label": "Real estate agencies & property services",
    "tags": [
      "office:estate_agent",
      "office:property_management"
    ]
  },
  {
    "id": "construction",
    "label": "Builders, contractors & construction firms",
    "tags": [
      "office:construction_company",
      "craft:builder",
      "craft:carpenter",
      "craft:electrician",
      "craft:plumber"
    ]
  },
  {
    "id": "architecture",
    "label": "Architects, interior designers & engineers",
    "tags": [
      "office:architect",
      "office:interior_design",
      "office:engineer"
    ]
  },
  {
    "id": "manufacturing",
    "label": "Manufacturers, factories & industrial businesses",
    "tags": [
      "man_made:works",
      "industrial:factory",
      "industrial:manufacturer"
    ]
  },
  {
    "id": "logistics",
    "label": "Logistics, couriers & transport companies",
    "tags": [
      "office:logistics",
      "office:transport",
      "office:courier",
      "amenity:post_office"
    ]
  },
  {
    "id": "warehousing",
    "label": "Warehousing & storage businesses",
    "tags": [
      "industrial:warehouse",
      "shop:storage_rental"
    ]
  },
  {
    "id": "automotive",
    "label": "Auto dealers, repair shops & vehicle services",
    "tags": [
      "shop:car",
      "shop:car_repair",
      "shop:car_parts",
      "shop:motorcycle",
      "amenity:car_wash"
    ]
  },
  {
    "id": "education",
    "label": "Schools, colleges & universities",
    "tags": [
      "amenity:school",
      "amenity:college",
      "amenity:university",
      "amenity:kindergarten"
    ]
  },
  {
    "id": "training",
    "label": "Coaching, training & language institutes",
    "tags": [
      "amenity:language_school",
      "amenity:music_school",
      "amenity:driving_school",
      "office:educational_institution"
    ]
  },
  {
    "id": "it",
    "label": "IT, software & technology companies",
    "tags": [
      "office:it",
      "office:telecommunication"
    ]
  },
  {
    "id": "marketing",
    "label": "Marketing, advertising & creative agencies",
    "tags": [
      "office:advertising_agency",
      "office:marketing",
      "craft:photographer"
    ]
  },
  {
    "id": "finance",
    "label": "Banks, finance & insurance businesses",
    "tags": [
      "amenity:bank",
      "office:financial",
      "office:insurance"
    ]
  },
  {
    "id": "accounting",
    "label": "Accountants, tax advisors & consultants",
    "tags": [
      "office:accountant",
      "office:tax_advisor",
      "office:consulting"
    ]
  },
  {
    "id": "legal",
    "label": "Law firms, lawyers & notaries",
    "tags": [
      "office:lawyer",
      "office:notary"
    ]
  },
  {
    "id": "travel",
    "label": "Travel agencies & tourism operators",
    "tags": [
      "shop:travel_agency",
      "office:travel_agent"
    ]
  },
  {
    "id": "events",
    "label": "Event venues, wedding & entertainment businesses",
    "tags": [
      "amenity:events_venue",
      "amenity:conference_centre",
      "amenity:cinema",
      "leisure:bowling_alley"
    ]
  },
  {
    "id": "veterinary",
    "label": "Veterinary clinics & pet businesses",
    "tags": [
      "amenity:veterinary",
      "shop:pet",
      "shop:pet_grooming"
    ]
  },
  {
    "id": "agriculture",
    "label": "Agricultural suppliers & garden businesses",
    "tags": [
      "shop:agrarian",
      "shop:garden_centre",
      "shop:farm",
      "craft:agricultural_engines"
    ]
  },
  {
    "id": "energy",
    "label": "Energy, utilities & fuel businesses",
    "tags": [
      "office:energy_supplier",
      "office:water_utility",
      "amenity:fuel"
    ]
  },
  {
    "id": "nonprofits",
    "label": "NGOs, associations & social organisations",
    "tags": [
      "office:ngo",
      "office:association",
      "office:charity"
    ]
  },
  {
    "id": "recruitment",
    "label": "Recruitment & employment agencies",
    "tags": [
      "office:employment_agency"
    ]
  },
  {
    "id": "offices",
    "label": "Corporate offices, SMEs & professional services",
    "tags": [
      "office:company",
      "office:research",
      "office:administrative",
      "office:coworking"
    ]
  }
];
export const allBusinessTags=Array.from(new Set(["shop","office","craft","industrial",...businessCategories.flatMap(c=>c.tags).filter(t=>!["shop","office","craft","industrial"].includes(t.split(":")[0]))]));
export function categoryTags(id:string){return id==="all"?allBusinessTags:businessCategories.find(c=>c.id===id)?.tags;}
export function overpassSelectors(id:string){return (categoryTags(id)||[]).map(tag=>{const [key,value]=tag.split(":");return value?`["${key}"="${value}"]`:`["${key}"]`;});}
export function businessIndustry(tags:Record<string,string>,selected:string){const found=businessCategories.find(c=>c.tags.some(tag=>{const [key,value]=tag.split(":");return key in tags&&(!value||tags[key]===value);}));return found?.label||(tags.shop?"Retail & trade businesses":tags.office?"Corporate & professional services":tags.craft?"Skilled trades & local services":tags.industrial?"Industrial businesses":"")||businessCategories.find(c=>c.id===selected)?.label||"Business · qualification pending";}
