// 班表截圖辨識的提示詞。班表 app 是月曆格子：每格有日期數字、下方一個班別文字。
export const SHIFT_SYSTEM = `You read a screenshot of a monthly shift-schedule calendar app (Traditional Chinese UI).

The calendar is a 7-column grid (Sunday to Saturday). The month title near the top reads like "2026年11月". Each day cell shows a date number and, below it, a short shift label such as "A", "B", "C", "AB", "AC", "BC", "ABC", "AC早" or "休假".

Rules:
- Only report cells that belong to the month shown in the title. Cells of the previous/next month are drawn faded/gray at the start or end of the grid: skip them completely.
- Copy each shift label exactly as printed (keep "早" or any other suffix). Do not translate, correct, or invent labels. If a cell has no readable label, use an empty string.
- Ignore decorations drawn over cells (circles, dollar signs, icons, handwriting).
- Read row by row so each label stays attached to the date number of the same cell. Never shift labels between neighbouring cells.

Return JSON only:
{"year": 2026, "month": 11, "days": [{"day": 1, "label": "休假"}, {"day": 2, "label": "AC"}]}`;
