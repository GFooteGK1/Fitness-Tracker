/**
 * Compressed nutrition knowledge — always included in the Nutritionist prompt.
 * Per Vercel's AGENTS.md findings, persistent context outperforms on-demand retrieval.
 * Target: ~2KB to keep total prompt under 8KB.
 */

export const NUTRITION_KNOWLEDGE = `## Food Macro Reference (per standard serving)
Chicken breast 6oz: P:54 C:0 F:3 246cal
Salmon 6oz: P:40 C:0 F:18 320cal
Ground beef 95/5 6oz: P:48 C:0 F:10 280cal
Steak sirloin 8oz: P:62 C:0 F:16 390cal
Eggs 2 large: P:12 C:1 F:10 143cal
Egg whites 4: P:14 C:0 F:0 60cal
Greek yogurt 1cup: P:20 C:8 F:0 120cal
Cottage cheese 1cup: P:28 C:6 F:5 180cal
Protein shake 1scoop+water: P:25 C:3 F:1 120cal
Turkey breast 6oz: P:50 C:0 F:2 222cal
Tuna canned 5oz: P:30 C:0 F:1 130cal
Shrimp 6oz: P:36 C:0 F:2 168cal
White rice 1cup cooked: P:4 C:45 F:0 200cal
Brown rice 1cup cooked: P:5 C:45 F:2 216cal
Sweet potato 1med: P:2 C:26 F:0 112cal
Oatmeal 1/2cup dry: P:5 C:27 F:3 150cal
Bread wheat 1slice: P:4 C:14 F:1 80cal
Pasta 2oz dry: P:7 C:42 F:1 200cal
Tortilla flour large: P:4 C:36 F:4 200cal
Banana 1med: P:1 C:27 F:0 105cal
Apple 1med: P:0 C:25 F:0 95cal
Blueberries 1cup: P:1 C:21 F:0 85cal
Avocado 1/2: P:2 C:6 F:15 160cal
Broccoli 1cup: P:3 C:6 F:0 31cal
Spinach 2cups raw: P:2 C:2 F:0 14cal
Almonds 1oz(23): P:6 C:6 F:14 164cal
Peanut butter 2tbsp: P:8 C:6 F:16 190cal
Olive oil 1tbsp: P:0 C:0 F:14 120cal
Butter 1tbsp: P:0 C:0 F:12 102cal
Cheese cheddar 1oz: P:7 C:0 F:9 113cal
Whole milk 1cup: P:8 C:12 F:8 150cal
Almond milk unsw 1cup: P:1 C:1 F:3 30cal

## Restaurant Estimation Heuristics
- Assume 1.5x home portions at restaurants
- Add 10-15g fat for fried items, 5g for sauteed
- Rice/grain bowls (Chipotle-style): 600-800cal with protein
- Fast food burger: 400-600cal, ~25g P
- Sushi roll 8pc: 300-400cal, ~15g P
- Pizza slice large: 300cal, ~12g P
- Salad with dressing: 300-500cal, varies by protein
- Sandwich/wrap: 400-600cal, ~25g P
- Coffee drinks (latte, mocha): 150-400cal
- Beer 12oz: 150cal, Wine 5oz: 125cal

## Quick Macro Math
P*4 + C*4 + F*9 = total calories (verify within 10%)
1g protein = 4cal, 1g carbs = 4cal, 1g fat = 9cal`
