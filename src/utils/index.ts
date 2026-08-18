export async function chunkifyArrayForCallback(array: any[], callback: (chunk: any[]) => void | Promise<void>, chunkSize: number = 100) {
    while (array.length > 0) {
        const chunk = array.splice(0, chunkSize);
        await callback(chunk);
    }
}

const songNameRegex = /[A-Z]|[a-z]|[0-9]/g;
const userNameRegex = /[^<>\r\n\t]+/g;

export function filterSongName(str: string): string {
    return (str.match(songNameRegex) || []).join('');
}

export function filterUsername(str: string): string {
    return (str.match(userNameRegex) || []).join('').trim();
}

export function formatLog(content: string, hue: number | null = null, isPM: boolean = false): string {
    return JSON.stringify({
        content: content,
        hue: hue,
        date: Date.now(),
        isPM: isPM
    });
}

export function ordinalNum(num: number): string {
    if (num % 10 === 1 && num !== 11)
        return num + 'st';
    if (num % 10 === 2 && num !== 12)
        return num + 'nd';
    if (num % 10 === 3 && num !== 13)
        return num + 'rd';
    return num + 'th';
}

export function hasOnlyLettersAndNumbers(str: string): boolean {
    return /^[A-Za-z0-9]*$/.test(str);
}

export function removeFromArray(arr: any[], item: any): any[] {
    const index = arr.indexOf(item, 0);
    if (index === -1)
        return arr;
    arr.splice(index, 1);
    return arr;
}

export function filterChatMessage(msg: string, chatFilter: Map<string, string>): string {
    msg = msg.replaceAll('\n', ' ');

    const words: string[] = [];
    for (const word of msg.split(' ')) {
        const filter = chatFilter.get(word.toLowerCase());
        words.push(filter ?? word);
    }
    return words.join(' ');
}

export const validCountries = [
    null,
    'AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AG', 'AR',
    'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY',
    'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BA', 'BW', 'BV', 'BR',
    'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY',
    'CF', 'TD', 'CL', 'CN', 'CX', 'CC', 'CO', 'KM', 'CG', 'CD',
    'CK', 'CR', 'CI', 'HR', 'CU', 'CY', 'CZ', 'DK', 'DJ', 'DM',
    'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'ET', 'FK', 'FO',
    'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GM', 'GE', 'DE',
    'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN',
    'GW', 'GY', 'HT', 'HM', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID',
    'IR', 'IQ', 'IE', 'IM', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ',
    'KE', 'KI', 'KR', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR',
    'LY', 'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV',
    'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD',
    'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP',
    'NL', 'AN', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'MP',
    'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH',
    'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL',
    'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA',
    'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SB', 'SO', 'ZA',
    'GS', 'ES', 'LK', 'SD', 'SR', 'SJ', 'SZ', 'SE', 'CH', 'SY',
    'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN',
    'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM',
    'UY', 'UZ', 'VU', 'VA', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH',
    'YE', 'ZM', 'ZW',
] as const;

export function intToHue(num: number): number {
    num >>>= 0;
    const b = num & 0xFF,
        g = (num & 0xFF00) >>> 8,
        r = (num & 0xFF0000) >>> 16;

    const cMax = Math.max(r, g, b);
    const cMin = Math.min(r, g, b);

    if (cMax === r)
        return 60 * ((g - b) / (cMax - cMin));
    if (cMax === g)
        return 60 * (2.0 + (b - r) / (cMax - cMin));

    return 60 * (4.0 + (r - g) / (cMax - cMin));
}

export function getFlagEmoji(countryCode: string): string {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}
