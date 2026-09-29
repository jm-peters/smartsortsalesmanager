/**
 * Intelligent Emoji Relevancy Helper for Kenyan Duka & Retail Inventory
 * Suggests contextually accurate emojis based on English & Swahili product names.
 */

interface EmojiRule {
  keywords: string[];
  emoji: string;
}

const EMOJI_RULES: EmojiRule[] = [
  // Staples & Grains
  { keywords: ['sugar', 'sukari', 'rice', 'mchele', 'basmati', 'pishori', 'biryani'], emoji: '🍚' },
  { keywords: ['flour', 'unga', 'maize', 'wheat', 'jogoo', 'pembe', 'ajab', 'hostess', 'dola', 'sembe'], emoji: '🌾' },
  { keywords: ['salt', 'chumvi', 'iodized'], emoji: '🧂' },
  { keywords: ['corn', 'mahindi', 'popcorn', 'mahindi ya kuchoma'], emoji: '🌽' },
  { keywords: ['beans', 'maharagwe', 'kunde', 'ndengu', 'green grams', 'peas', 'minji', 'githeri'], emoji: '🫘' },

  // Dairy & Breakfast
  { keywords: ['milk', 'maziwa', 'mala', 'lala', 'brookside', 'daima', 'kcc', 'tuzo', 'fresha', 'yoghurt', 'yogurt'], emoji: '🥛' },
  { keywords: ['bread', 'mkate', 'toast', 'festive', 'supaloaf', 'broadways', 'slices'], emoji: '🍞' },
  { keywords: ['egg', 'mayai', 'tray', 'quail'], emoji: '🥚' },
  { keywords: ['butter', 'blueband', 'blue band', 'margarine', 'prestige', 'gold band'], emoji: '🧈' },
  { keywords: ['tea', 'chai', 'ketepa', 'fahari', 'leaves', 'majani', 'tea leaves'], emoji: '🍵' },
  { keywords: ['coffee', 'kahawa', 'nescafe', 'dormans'], emoji: '☕' },
  { keywords: ['cocoa', 'milo', 'cadbury', 'chocolate'], emoji: '🍫' },

  // Fats & Oils
  { keywords: ['oil', 'cooking oil', 'mafuta', 'salit', 'elianto', 'rina', 'fresh fri', 'top fry', 'sunflower', 'golden fry'], emoji: '🍾' },
  { keywords: ['solid fat', 'kimbo', 'cowboy', 'kasuku'], emoji: '🛢️' },

  // Beverages & Drinks
  { keywords: ['water', 'maji', 'dasani', 'keringet', 'aquamist', 'highland'], emoji: '💧' },
  { keywords: ['soda', 'coke', 'cocacola', 'coca-cola', 'fanta', 'sprite', 'krest', 'pepsi', 'stoni', 'novida'], emoji: '🥤' },
  { keywords: ['juice', 'minute maid', 'delmonte', 'afia', 'ceres', 'pick n peel', 'quench'], emoji: '🧃' },
  { keywords: ['energy', 'red bull', 'monster', 'predator', 'power horse'], emoji: '⚡' },

  // Snacks & Confectionery
  { keywords: ['biscuit', 'biscuits', 'cookie', 'cookies', 'oreo', 'glucose', 'digestive', 'manji', 'nuvita'], emoji: '🍪' },
  { keywords: ['sweet', 'sweets', 'candy', 'candies', 'pipi', 'bubblegum', 'patco', 'tropical', 'lollipop'], emoji: '🍬' },
  { keywords: ['crisps', 'chips', 'karanga', 'peanuts', 'groundnuts', 'njugu', 'popcorn'], emoji: '🥜' },
  { keywords: ['cake', 'keki', 'muffin', 'queen cake', 'mandazi', 'mahamri', 'samosa', 'smokie'], emoji: '🧁' },

  // Fresh Produce & Groceries
  { keywords: ['tomato', 'tomatoes', 'nyanya'], emoji: '🍅' },
  { keywords: ['onion', 'onions', 'kitunguu', 'vitunguu'], emoji: '🧅' },
  { keywords: ['potato', 'potatoes', 'waru', 'viazi'], emoji: '🥔' },
  { keywords: ['cabbage', 'sukuma', 'sukumawiki', 'sukuma wiki', 'spinach', 'mboga', 'managu', 'terere'], emoji: '🥬' },
  { keywords: ['banana', 'bananas', 'ndizi', 'matoke'], emoji: '🍌' },
  { keywords: ['apple', 'apples', 'tunda', 'matunda'], emoji: '🍎' },
  { keywords: ['mango', 'mangoes', 'embe', 'maembe'], emoji: '🥭' },
  { keywords: ['avocado', 'avocados', 'parachichi', 'ovukado'], emoji: '🥑' },
  { keywords: ['watermelon', 'melon', 'tikiti'], emoji: '🍉' },
  { keywords: ['carrot', 'carrots', 'karoti'], emoji: '🥕' },
  { keywords: ['garlic', 'tangawizi', 'ginger', 'saumu'], emoji: '🧄' },
  { keywords: ['chili', 'pilipili', 'pepper'], emoji: '🌶️' },
  { keywords: ['lemon', 'lime', 'ndimu', 'limau', 'orange', 'machungwa'], emoji: '🍋' },

  // Meat, Poultry & Fish
  { keywords: ['meat', 'nyama', 'beef', 'steak', 'mince'], emoji: '🥩' },
  { keywords: ['chicken', 'kuku', 'poultry', 'wings'], emoji: '🍗' },
  { keywords: ['fish', 'samaki', 'omena', 'tilapia', 'nile perch'], emoji: '🐟' },

  // Cleaning & Personal Care
  { keywords: ['soap', 'sabuni', 'omo', 'sunlight', 'ariel', 'ushindi', 'menengai', 'geisha', 'detol', 'dettol', 'lifebuoy', 'bar soap', 'liquid soap'], emoji: '🧼' },
  { keywords: ['detergent', 'powder', 'downy', 'comfort', 'bleach', 'jik'], emoji: '🧴' },
  { keywords: ['tissue', 'toilet paper', 'velvex', 'hanan', 'serviettes', 'napkins', 'wipes'], emoji: '🧻' },
  { keywords: ['toothpaste', 'colgate', 'pepsodent', 'close up', 'toothbrush', 'brush', 'miswaki'], emoji: '🪥' },
  { keywords: ['pad', 'pads', 'kotex', 'always', 'sanitary'], emoji: '🌸' },
  { keywords: ['diaper', 'diapers', 'pampers', 'huggies', 'softcare'], emoji: '👶' },
  { keywords: ['shoe polish', 'kiwi', 'polish'], emoji: '👞' },
  { keywords: ['lotion', 'vaseline', 'glycerine', 'creme', 'cream', 'perfume', 'spray', 'deodorant'], emoji: '✨' },

  // Household & Hardware
  { keywords: ['match', 'matches', 'kiberiti', 'matchbox'], emoji: '🔥' },
  { keywords: ['candle', 'candles', 'mshumaa', 'mishumaa'], emoji: '🕯️' },
  { keywords: ['battery', 'batteries', 'stima', 'panasonic', 'eveready', 'tiger'], emoji: '🔋' },
  { keywords: ['bulb', 'light bulb', 'taa', 'led bulb'], emoji: '💡' },
  { keywords: ['steelwool', 'scotchbrite', 'scrubber', 'sponge', 'gloves', 'broom', 'fagio'], emoji: '🧽' },
  { keywords: ['bucket', 'basin', 'ndoo', 'jug'], emoji: '🪣' },

  // Telecom, Airtime & Tech
  { keywords: ['airtime', 'kadi', 'safaricom', 'airtel', 'telkom', 'scratch card', 'data', 'bundle'], emoji: '📱' },
  { keywords: ['cable', 'charger', 'usb', 'earphone', 'headphone'], emoji: '🔌' },

  // Smokes & Tobacco
  { keywords: ['cigarette', 'cigarettes', 'sigara', 'sportsman', 'rooster', 'safari', 'supermatch', 'dunhill', 'embassy', 'fegi'], emoji: '🚬' },

  // Stationery & School
  { keywords: ['pen', 'biro', 'pencil', 'eraser', 'sharpener', 'ruler'], emoji: '🖊️' },
  { keywords: ['book', 'exercise book', 'daftari', 'counter book', 'diary', 'envelope'], emoji: '📓' },

  // Pharmacy & OTC
  { keywords: ['panadol', 'maramoja', 'mara moja', 'paracetamol', 'aspirin', 'action', 'hedex', 'dawa', 'cough syrup', 'bandaid', 'plaster'], emoji: '💊' },
];

/**
 * Returns a contextually relevant emoji for a given product name.
 * If no confident match is found, returns an empty string (so sellers who don't want emojis aren't forced into random ones).
 */
export function getRelevantEmoji(name: string, unit?: string): string {
  if (!name || !name.trim()) return '';

  const cleanName = name.toLowerCase().trim();

  // Unit-specific fallback if name is generic
  if (unit === 'kg' && (cleanName.includes('sugar') || cleanName.includes('sukari'))) return '🍚';
  if (unit === 'ltr' && (cleanName.includes('oil') || cleanName.includes('mafuta'))) return '🍾';

  for (const rule of EMOJI_RULES) {
    for (const keyword of rule.keywords) {
      // Regex boundary check or substring match
      if (cleanName.includes(keyword)) {
        return rule.emoji;
      }
    }
  }

  return '';
}

/**
 * Popular quick-select retail emojis for instant one-tap selection
 */
export const POPULAR_RETAIL_EMOJIS = [
  '🍚', '🥛', '🍞', '🍾', '🌾', '🥚', '🍵', '☕',
  '🧂', '💧', '🥤', '🧃', '🧼', '🍪', '🍬', '🔥',
  '📱', '🚬', '🍅', '🧅', '🥔', '🥬', '🍌', '🥩',
  '🧻', '🪥', '🔋', '💡', '💊', '🖊️', '🫘', '🥜'
];
