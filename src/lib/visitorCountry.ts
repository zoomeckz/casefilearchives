// The visitor's country for analytics, as a two-letter code (SE, GB, US…), worked out in the
// browser without any outside lookup: from the time zone, else from the browser language's
// region. The database prefers the country of the visitor's connection when it has it.

const ZONES: Record<string, string> = {
  // Europe
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Atlantic/Reykjavik": "IS",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Lisbon": "PT", "Europe/Madrid": "ES", "Atlantic/Canary": "ES",
  "Europe/Paris": "FR", "Europe/Brussels": "BE", "Europe/Amsterdam": "NL", "Europe/Luxembourg": "LU", "Europe/Berlin": "DE",
  "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Rome": "IT", "Europe/Malta": "MT", "Europe/Monaco": "MC",
  "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Warsaw": "PL", "Europe/Budapest": "HU", "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR", "Europe/Belgrade": "RS", "Europe/Sarajevo": "BA", "Europe/Podgorica": "ME", "Europe/Skopje": "MK",
  "Europe/Tirane": "AL", "Europe/Athens": "GR", "Europe/Sofia": "BG", "Europe/Bucharest": "RO", "Europe/Chisinau": "MD",
  "Europe/Kiev": "UA", "Europe/Kyiv": "UA", "Europe/Minsk": "BY", "Europe/Vilnius": "LT", "Europe/Riga": "LV",
  "Europe/Tallinn": "EE", "Europe/Moscow": "RU", "Europe/Istanbul": "TR", "Asia/Nicosia": "CY", "Europe/Nicosia": "CY",
  // Americas
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US", "America/Los_Angeles": "US",
  "America/Anchorage": "US", "Pacific/Honolulu": "US", "America/Detroit": "US", "America/Indiana/Indianapolis": "US", "America/Boise": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA",
  "America/St_Johns": "CA", "America/Regina": "CA", "America/Mexico_City": "MX", "America/Monterrey": "MX", "America/Tijuana": "MX",
  "America/Cancun": "MX", "America/Guatemala": "GT", "America/El_Salvador": "SV", "America/Tegucigalpa": "HN", "America/Managua": "NI",
  "America/Costa_Rica": "CR", "America/Panama": "PA", "America/Havana": "CU", "America/Jamaica": "JM", "America/Santo_Domingo": "DO",
  "America/Puerto_Rico": "PR", "America/Bogota": "CO", "America/Caracas": "VE", "America/Lima": "PE", "America/Guayaquil": "EC",
  "America/La_Paz": "BO", "America/Santiago": "CL", "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Montevideo": "UY",
  "America/Asuncion": "PY", "America/Sao_Paulo": "BR", "America/Fortaleza": "BR", "America/Recife": "BR", "America/Manaus": "BR",
  "America/Bahia": "BR", "America/Belem": "BR",
  // Asia and the Middle East
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW",
  "Asia/Macau": "MO", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN", "Asia/Jakarta": "ID", "Asia/Makassar": "ID", "Asia/Manila": "PH", "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Kathmandu": "NP", "Asia/Colombo": "LK",
  "Asia/Yangon": "MM", "Asia/Phnom_Penh": "KH", "Asia/Ulaanbaatar": "MN", "Asia/Almaty": "KZ", "Asia/Tashkent": "UZ",
  "Asia/Tbilisi": "GE", "Asia/Yerevan": "AM", "Asia/Baku": "AZ", "Asia/Tehran": "IR", "Asia/Baghdad": "IQ",
  "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM", "Asia/Amman": "JO", "Asia/Beirut": "LB", "Asia/Damascus": "SY", "Asia/Jerusalem": "IL",
  "Asia/Tel_Aviv": "IL", "Asia/Gaza": "PS", "Asia/Hebron": "PS", "Asia/Kabul": "AF",
  // Africa
  "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Africa/Tripoli": "LY",
  "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Abidjan": "CI", "Africa/Dakar": "SN", "Africa/Nairobi": "KE",
  "Africa/Addis_Ababa": "ET", "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ", "Africa/Kigali": "RW", "Africa/Khartoum": "SD",
  "Africa/Johannesburg": "ZA", "Africa/Harare": "ZW", "Africa/Lusaka": "ZM", "Africa/Maputo": "MZ", "Africa/Luanda": "AO",
  "Africa/Kinshasa": "CD", "Africa/Windhoek": "NA", "Indian/Mauritius": "MU",
  // Oceania
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Australia/Adelaide": "AU",
  "Australia/Hobart": "AU", "Australia/Darwin": "AU", "Pacific/Auckland": "NZ", "Pacific/Fiji": "FJ", "Pacific/Guam": "GU",
};

let cached: string | null | undefined;

export function visitorCountry(): string | null {
  if (cached !== undefined) return cached;
  let code: string | null = null;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    code = (zone && ZONES[zone]) || null;
  } catch { /* old browser */ }
  if (!code) {
    try {
      for (const lang of navigator.languages ?? [navigator.language]) {
        const region = lang.split(/[-_]/)[1];
        if (region && /^[A-Za-z]{2}$/.test(region)) { code = region.toUpperCase(); break; }
      }
    } catch { /* no navigator */ }
  }
  cached = code;
  return code;
}
