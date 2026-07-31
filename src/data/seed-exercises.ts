/**
 * 內建動作庫 seed。首次啟動由 db 的 seedExercisesIfEmpty() 寫入；
 * 之後新增的 seed 動作也靠同一支函式「依名稱補齊」。
 *
 * ⚠️ 本陣列的**順序就是動作庫的顯示順序**（見 src/lib/exerciseOrder.ts）。
 * ⚠️ 改一個動作的 name 等於改它的 id（見下方 seedExerciseId），
 *    一定要配 Dexie version bump + idAliases 遷移，否則舊訓練/範本的參照會失效。
 */

import type { MuscleGroup, Equipment, ArmSubGroup } from '../db/schema';

export interface ExerciseSeed {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  subGroup?: ArmSubGroup;
}

/**
 * 內建動作的確定性 id：同一個名稱在任何裝置都得到同一個 id。
 *
 * 早期改用 crypto.randomUUID()，導致每台裝置的內建動作 id 都不一樣；
 * 而雲端同步只推送自訂動作，跨裝置的範本／訓練因此指到查不到的 id
 * （UI 卡在「讀取中...」，進度統計也被切成兩半）。
 * 內建動作不上雲，靠這個純函式讓兩邊自然對齊即可。
 */
export function seedExerciseId(name: string): string {
  return `seed:${name}`;
}

export const SEED_EXERCISES: ExerciseSeed[] = [
  // ---- 胸 ----
  { name: '槓鈴臥推', muscleGroup: '胸', equipment: '槓鈴' },
  { name: '啞鈴臥推', muscleGroup: '胸', equipment: '啞鈴' },
  { name: '上斜槓鈴臥推', muscleGroup: '胸', equipment: '槓鈴' },
  { name: '上斜啞鈴臥推', muscleGroup: '胸', equipment: '啞鈴' },
  { name: '蝴蝶機夾胸', muscleGroup: '胸', equipment: '機械' },
  { name: '纜繩夾胸', muscleGroup: '胸', equipment: '纜繩' },
  { name: '雙槓臂屈伸（胸）', muscleGroup: '胸', equipment: '徒手' },
  { name: '伏地挺身', muscleGroup: '胸', equipment: '徒手' },

  // ---- 背 ----
  { name: '引體向上', muscleGroup: '背', equipment: '徒手' },
  { name: '滑輪下拉（寬握）', muscleGroup: '背', equipment: '纜繩' },
  { name: '滑輪下拉（窄握）', muscleGroup: '背', equipment: '纜繩' },
  { name: '槓鈴划船', muscleGroup: '背', equipment: '槓鈴' },
  { name: '啞鈴單手划船', muscleGroup: '背', equipment: '啞鈴' },
  { name: '坐姿划船（寬握）', muscleGroup: '背', equipment: '纜繩' },
  { name: '坐姿划船（窄握）', muscleGroup: '背', equipment: '纜繩' },
  { name: 'T槓划船', muscleGroup: '背', equipment: '槓鈴' },
  { name: '硬舉', muscleGroup: '背', equipment: '槓鈴' },
  { name: '直臂下壓', muscleGroup: '背', equipment: '纜繩' },

  // ---- 腿臀 ----
  { name: '槓鈴深蹲', muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '腿推', muscleGroup: '腿臀', equipment: '機械' },
  { name: '腿屈伸', muscleGroup: '腿臀', equipment: '機械' },
  { name: '腿後勾', muscleGroup: '腿臀', equipment: '機械' },
  { name: '羅馬尼亞硬舉', muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '弓步蹲', muscleGroup: '腿臀', equipment: '啞鈴' },
  { name: '保加利亞分腿蹲', muscleGroup: '腿臀', equipment: '啞鈴' },
  { name: '站姿提踵', muscleGroup: '腿臀', equipment: '機械' },
  { name: '槓鈴臀推', muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '臀橋', muscleGroup: '腿臀', equipment: '徒手' },
  { name: '髖外展機', muscleGroup: '腿臀', equipment: '機械' },
  { name: '纜繩後踢腿', muscleGroup: '腿臀', equipment: '纜繩' },

  // ---- 肩 ----
  { name: '槓鈴肩推', muscleGroup: '肩', equipment: '槓鈴' },
  { name: '啞鈴肩推', muscleGroup: '肩', equipment: '啞鈴' },
  { name: '啞鈴側平舉', muscleGroup: '肩', equipment: '啞鈴' },
  { name: '啞鈴前平舉', muscleGroup: '肩', equipment: '啞鈴' },
  { name: '啞鈴飛鳥', muscleGroup: '肩', equipment: '啞鈴' },
  { name: '反向飛鳥', muscleGroup: '肩', equipment: '啞鈴' },
  { name: '臉拉', muscleGroup: '肩', equipment: '纜繩' },
  { name: '直立划船', muscleGroup: '肩', equipment: '槓鈴' },

  // ---- 手臂 ----
  // 二頭
  { name: '槓鈴彎舉', muscleGroup: '手臂', equipment: '槓鈴', subGroup: '二頭' },
  { name: '啞鈴彎舉', muscleGroup: '手臂', equipment: '啞鈴', subGroup: '二頭' },
  { name: '錘式彎舉', muscleGroup: '手臂', equipment: '啞鈴', subGroup: '二頭' },
  { name: '牧師彎舉', muscleGroup: '手臂', equipment: '機械', subGroup: '二頭' },
  { name: '纜繩彎舉', muscleGroup: '手臂', equipment: '纜繩', subGroup: '二頭' },
  // 三頭
  { name: '纜繩下壓（平把）', muscleGroup: '手臂', equipment: '纜繩', subGroup: '三頭' },
  { name: '纜繩下壓（繩索）', muscleGroup: '手臂', equipment: '纜繩', subGroup: '三頭' },
  { name: '仰臥臂屈伸', muscleGroup: '手臂', equipment: '槓鈴', subGroup: '三頭' },
  { name: '啞鈴過頭臂屈伸', muscleGroup: '手臂', equipment: '啞鈴', subGroup: '三頭' },
  { name: '窄握臥推', muscleGroup: '手臂', equipment: '槓鈴', subGroup: '三頭' },
  { name: '雙槓撐體', muscleGroup: '手臂', equipment: '徒手', subGroup: '三頭' },

  // ---- 核心 ----
  { name: '棒式', muscleGroup: '核心', equipment: '徒手' },
  { name: '捲腹', muscleGroup: '核心', equipment: '徒手' },
  { name: '懸吊抬腿', muscleGroup: '核心', equipment: '徒手' },
  { name: '俄羅斯轉體', muscleGroup: '核心', equipment: '徒手' },
  { name: '滑輪捲腹', muscleGroup: '核心', equipment: '纜繩' },

  // ---- 有氧 ----
  { name: '跑步機', muscleGroup: '有氧', equipment: '其他' },
  { name: '登階機', muscleGroup: '有氧', equipment: '其他' },
];

/** 可使用輔助重量（助力機／彈力帶）的動作，依名稱比對 */
export const ASSISTED_EXERCISE_NAMES = new Set<string>([
  '引體向上', '雙槓臂屈伸（胸）', '雙槓撐體',
]);
