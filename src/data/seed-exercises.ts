/**
 * 內建動作庫 seed（Phase 2）
 * 約 50 個常見動作，依肌群分布。首次啟動由 db 的 seedExercisesIfEmpty() 寫入。
 *
 * 註：以下 MuscleGroup / Equipment 型別應與 docs/ROADMAP.md §2、以及 src/db/schema.ts
 *     的定義一致。等 schema.ts 建好後，可把下面的本地型別改成：
 *         import type { MuscleGroup, Equipment } from '../db/schema';
 *     seed 只帶「定義」欄位；id / createdAt / isCustom 由 repository 寫入時補上：
 *         { ...seed, id: crypto.randomUUID(), createdAt: Date.now(), isCustom: false }
 */

import type { MuscleGroup, Equipment } from '../db/schema';

export interface ExerciseSeed {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
}

export const SEED_EXERCISES: ExerciseSeed[] = [
  // ---- 胸 ----
  { name: '槓鈴臥推',       muscleGroup: '胸', equipment: '槓鈴' },
  { name: '上斜槓鈴臥推',   muscleGroup: '胸', equipment: '槓鈴' },
  { name: '啞鈴臥推',       muscleGroup: '胸', equipment: '啞鈴' },
  { name: '上斜啞鈴臥推',   muscleGroup: '胸', equipment: '啞鈴' },
  { name: '啞鈴飛鳥',       muscleGroup: '胸', equipment: '啞鈴' },
  { name: '蝴蝶機夾胸',     muscleGroup: '胸', equipment: '機械' },
  { name: '纜繩夾胸',       muscleGroup: '胸', equipment: '纜繩' },
  { name: '伏地挺身',       muscleGroup: '胸', equipment: '徒手' },

  // ---- 背 ----
  { name: '引體向上',       muscleGroup: '背', equipment: '徒手' },
  { name: '滑輪下拉',       muscleGroup: '背', equipment: '纜繩' },
  { name: '槓鈴划船',       muscleGroup: '背', equipment: '槓鈴' },
  { name: '啞鈴單手划船',   muscleGroup: '背', equipment: '啞鈴' },
  { name: '坐姿划船',       muscleGroup: '背', equipment: '纜繩' },
  { name: 'T槓划船',        muscleGroup: '背', equipment: '槓鈴' },
  { name: '硬舉',           muscleGroup: '背', equipment: '槓鈴' },
  { name: '直臂下壓',       muscleGroup: '背', equipment: '纜繩' },

  // ---- 腿 ----
  { name: '槓鈴深蹲',       muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '腿推',           muscleGroup: '腿臀', equipment: '機械' },
  { name: '腿屈伸',         muscleGroup: '腿臀', equipment: '機械' },
  { name: '腿後勾',         muscleGroup: '腿臀', equipment: '機械' },
  { name: '羅馬尼亞硬舉',   muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '弓步蹲',         muscleGroup: '腿臀', equipment: '啞鈴' },
  { name: '保加利亞分腿蹲', muscleGroup: '腿臀', equipment: '啞鈴' },
  { name: '站姿提踵',       muscleGroup: '腿臀', equipment: '機械' },

  // ---- 肩 ----
  { name: '槓鈴肩推',       muscleGroup: '肩', equipment: '槓鈴' },
  { name: '啞鈴肩推',       muscleGroup: '肩', equipment: '啞鈴' },
  { name: '啞鈴側平舉',     muscleGroup: '肩', equipment: '啞鈴' },
  { name: '啞鈴前平舉',     muscleGroup: '肩', equipment: '啞鈴' },
  { name: '反向飛鳥',       muscleGroup: '肩', equipment: '啞鈴' },
  { name: '臉拉',           muscleGroup: '肩', equipment: '纜繩' },
  { name: '直立划船',       muscleGroup: '肩', equipment: '槓鈴' },

  // ---- 手臂 ----
  { name: '槓鈴彎舉',       muscleGroup: '手臂', equipment: '槓鈴' },
  { name: '啞鈴彎舉',       muscleGroup: '手臂', equipment: '啞鈴' },
  { name: '錘式彎舉',       muscleGroup: '手臂', equipment: '啞鈴' },
  { name: '牧師彎舉',       muscleGroup: '手臂', equipment: '機械' },
  { name: '纜繩彎舉',       muscleGroup: '手臂', equipment: '纜繩' },

  // ---- 手臂 ----
  { name: '纜繩下壓',       muscleGroup: '手臂', equipment: '纜繩' },
  { name: '仰臥臂屈伸',     muscleGroup: '手臂', equipment: '槓鈴' },
  { name: '啞鈴過頭臂屈伸', muscleGroup: '手臂', equipment: '啞鈴' },
  { name: '雙槓撐體',       muscleGroup: '手臂', equipment: '徒手' },
  { name: '窄握臥推',       muscleGroup: '手臂', equipment: '槓鈴' },

  // ---- 核心 ----
  { name: '棒式',           muscleGroup: '核心', equipment: '徒手' },
  { name: '捲腹',           muscleGroup: '核心', equipment: '徒手' },
  { name: '懸吊抬腿',       muscleGroup: '核心', equipment: '徒手' },
  { name: '俄羅斯轉體',     muscleGroup: '核心', equipment: '徒手' },
  { name: '滑輪捲腹',       muscleGroup: '核心', equipment: '纜繩' },

  // ---- 臀 ----
  { name: '槓鈴臀推',       muscleGroup: '腿臀', equipment: '槓鈴' },
  { name: '臀橋',           muscleGroup: '腿臀', equipment: '徒手' },
  { name: '髖外展機',       muscleGroup: '腿臀', equipment: '機械' },
  { name: '纜繩後踢腿',     muscleGroup: '腿臀', equipment: '纜繩' },

  // ---- 有氧 ----
  { name: '跑步機',         muscleGroup: '有氧', equipment: '其他' },
  { name: '登階機',         muscleGroup: '有氧', equipment: '其他' },
  { name: '飛輪',           muscleGroup: '有氧', equipment: '其他' },
  { name: '划船機',         muscleGroup: '有氧', equipment: '其他' },
  { name: '橢圓機',         muscleGroup: '有氧', equipment: '其他' },
  { name: '爬梯機',         muscleGroup: '有氧', equipment: '其他' },
  { name: '跳繩',           muscleGroup: '有氧', equipment: '其他' },
];
