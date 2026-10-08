import { countryCodes } from "./country-codes";
const display = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = countryCodes.map(code => ({ code, name: code === "XK" ? "Kosovo" : display.of(code) || code })).sort((a,b)=>a.name.localeCompare(b.name));
export const regions = ["Northern Africa","Sub-Saharan Africa","Eastern Africa","Middle Africa","Southern Africa","Western Africa","Northern America","Latin America and the Caribbean","Central America","Caribbean","South America","Central Asia","Eastern Asia","South-eastern Asia","Southern Asia","Western Asia","Northern Europe","Southern Europe","Western Europe","Eastern Europe","Australia and New Zealand","Melanesia","Micronesia","Polynesia","Antarctica"];
