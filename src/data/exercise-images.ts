// 動作示意圖對應表
// 來源：free-exercise-db (Unlicense / 公眾領域)，每動作含 0.jpg 起始、1.jpg 結束
// key = 動作中文名稱（內建動作以 UUID 種子化，名稱才跨裝置穩定）
// 圖檔位於 public/exercises/<slug>/，部署在 /GymTracker/ 子路徑下

export const EXERCISE_IMAGE_SLUGS: Record<string, string> = {
  '槓鈴臥推': 'barbell-bench-press-medium-grip',
  '上斜槓鈴臥推': 'barbell-incline-bench-press-medium-grip',
  '啞鈴臥推': 'dumbbell-bench-press',
  '上斜啞鈴臥推': 'incline-dumbbell-press',
  '啞鈴飛鳥': 'dumbbell-flyes',
  '蝴蝶機夾胸': 'butterfly',
  '纜繩夾胸': 'cable-crossover',
  '伏地挺身': 'pushups',
  '引體向上': 'pullups',
  '滑輪下拉': 'wide-grip-lat-pulldown',
  '槓鈴划船': 'bent-over-barbell-row',
  '啞鈴單手划船': 'one-arm-dumbbell-row',
  '坐姿划船': 'seated-cable-rows',
  'T槓划船': 'lying-t-bar-row',
  '硬舉': 'barbell-deadlift',
  '直臂下壓': 'straight-arm-pulldown',
  '槓鈴深蹲': 'barbell-full-squat',
  '腿推': 'leg-press',
  '腿屈伸': 'leg-extensions',
  '腿後勾': 'lying-leg-curls',
  '羅馬尼亞硬舉': 'romanian-deadlift',
  '弓步蹲': 'dumbbell-lunges',
  '保加利亞分腿蹲': 'split-squat-with-dumbbells',
  '站姿提踵': 'standing-calf-raises',
  '槓鈴肩推': 'standing-military-press',
  '啞鈴肩推': 'dumbbell-shoulder-press',
  '啞鈴側平舉': 'side-lateral-raise',
  '啞鈴前平舉': 'front-dumbbell-raise',
  '反向飛鳥': 'reverse-flyes',
  '臉拉': 'face-pull',
  '直立划船': 'upright-barbell-row',
  '槓鈴彎舉': 'barbell-curl',
  '啞鈴彎舉': 'dumbbell-alternate-bicep-curl',
  '錘式彎舉': 'hammer-curls',
  '牧師彎舉': 'preacher-curl',
  '纜繩彎舉': 'standing-biceps-cable-curl',
  '纜繩下壓': 'triceps-pushdown',
  '仰臥臂屈伸': 'lying-triceps-press',
  '啞鈴過頭臂屈伸': 'standing-dumbbell-triceps-extension',
  '雙槓撐體': 'dips-triceps-version',
  '窄握臥推': 'close-grip-barbell-bench-press',
  '棒式': 'plank',
  '捲腹': 'crunches',
  '懸吊抬腿': 'hanging-leg-raise',
  '俄羅斯轉體': 'russian-twist',
  '滑輪捲腹': 'cable-crunch',
  '槓鈴臀推': 'barbell-hip-thrust',
  '臀橋': 'butt-lift-bridge',
  '髖外展機': 'thigh-abductor',
  '纜繩後踢腿': 'glute-kickback',
  '跑步機': 'running-treadmill',
  '登階機': 'stair-master',
};

/**
 * 取得某動作的示意圖 URL 陣列（起始、結束）。
 * 沒有對應的動作回傳空陣列，呼叫端應據此優雅降級（不顯示圖片區）。
 */
export function getExerciseImages(name: string): string[] {
  const slug = EXERCISE_IMAGE_SLUGS[name];
  if (!slug) return [];
  return [0, 1].map((i) => `${import.meta.env.BASE_URL}exercises/${slug}/${i}.jpg`);
}

// Q 版圖卡（單張，白底調色盤 PNG，位於 public/exercises-q/<slug>.png）
// 這些動作與 EXERCISE_IMAGE_SLUGS 同名，直接復用其 slug。
// 目前 52 個內建動作中，除「跑步機 / 登階機」兩個有氧無圖卡外，其餘 50 個皆有。
const QCARD_NAMES = new Set<string>([
  // 胸
  '槓鈴臥推', '上斜槓鈴臥推', '啞鈴臥推', '上斜啞鈴臥推', '啞鈴飛鳥', '蝴蝶機夾胸', '纜繩夾胸', '伏地挺身',
  // 背
  '引體向上', '滑輪下拉', '槓鈴划船', '啞鈴單手划船', '坐姿划船', 'T槓划船', '硬舉', '直臂下壓',
  // 腿臀
  '槓鈴深蹲', '腿推', '腿屈伸', '腿後勾', '羅馬尼亞硬舉', '弓步蹲', '保加利亞分腿蹲', '站姿提踵',
  '槓鈴臀推', '臀橋', '髖外展機', '纜繩後踢腿',
  // 肩
  '槓鈴肩推', '啞鈴肩推', '啞鈴側平舉', '啞鈴前平舉', '反向飛鳥', '臉拉', '直立划船',
  // 手臂
  '槓鈴彎舉', '啞鈴彎舉', '錘式彎舉', '牧師彎舉', '纜繩彎舉', '纜繩下壓', '仰臥臂屈伸', '啞鈴過頭臂屈伸', '雙槓撐體', '窄握臥推',
  // 核心
  '棒式', '捲腹', '懸吊抬腿', '俄羅斯轉體', '滑輪捲腹',
]);

/** 取 Q 版圖卡 URL，沒有回 null（呼叫端 fallback 回原照片/圖示）。 */
export function getExerciseQCard(name: string): string | null {
  if (!QCARD_NAMES.has(name)) return null;
  const slug = EXERCISE_IMAGE_SLUGS[name];
  return slug ? `${import.meta.env.BASE_URL}exercises-q/${slug}.png` : null;
}
