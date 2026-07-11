/**
 * 宗諺 8 週 4 天分化訓練計畫（來源：ZongYuan_8Week_4Day_Perfect_v15.xlsx）
 * 純資料檔：課表對照頁讀取顯示，匯入功能讀取以建立範本＋訓練計畫。
 */
import type { MuscleGroup, Equipment } from '../db/schema';

export interface ZongYuanExercisePlan {
  planName: string;       // 教練課表原始動作名稱
  exerciseName: string;   // 對應動作庫名稱（既有動作沿用既有名稱；找不到對應的才新建自訂動作）
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isNewCustom: boolean;   // 匯入時是否需要新建自訂動作
  weekly: string[];       // 8 筆，W1~W8 顯示字串
  week1Sets: number;
  week1Reps: number;
}

export interface ZongYuanDayPlan {
  label: string;
  weeklyTotalSets: string[]; // 8 筆，當週總計（本日訓練總量）
  exercises: ZongYuanExercisePlan[];
}

export const ZONGYUAN_PROGRAM_NAME = '宗諺 8週4天分化訓練計畫';

export const ZONGYUAN_WEEK_LABELS = ['W1', 'W2', 'W3', 'W4（減量）', 'W5', 'W6', 'W7', 'W8（測試）'];

export const ZONGYUAN_8WEEK_PLAN: ZongYuanDayPlan[] = [
  {
    label: '拉 (Pull)',
    weeklyTotalSets: ['15組', '16組', '18組', '12組', '17組', '18組', '19組', '12組'],
    exercises: [
      {
        planName: '槓鈴划船', exerciseName: '槓鈴划船', muscleGroup: '背', equipment: '槓鈴', isNewCustom: false,
        weekly: ['4組 × 12下', '5組 × 10下', '5組 × 10下', '3組 × 10下', '6組 × 8下', '5組 × 8下', '6組 × 6下', '3組 × 10下'],
        week1Sets: 4, week1Reps: 12,
      },
      {
        planName: '滑輪下拉', exerciseName: '滑輪下拉', muscleGroup: '背', equipment: '纜繩', isNewCustom: false,
        weekly: ['4組 × 10下', '4組 × 10下', '5組 × 8下', '3組 × 10下', '4組 × 8下', '5組 × 6下', '5組 × 5下', '3組 × 8下'],
        week1Sets: 4, week1Reps: 10,
      },
      {
        planName: '機械水平划船', exerciseName: '機械水平划船', muscleGroup: '背', equipment: '機械', isNewCustom: true,
        weekly: Array(8).fill('3組 × 10下'),
        week1Sets: 3, week1Reps: 10,
      },
      {
        planName: '滑輪下拉', exerciseName: '滑輪下拉', muscleGroup: '背', equipment: '纜繩', isNewCustom: false,
        weekly: ['4組 × 10下', '4組 × 10下', '5組 × 8下', '3組 × 10下', '4組 × 8下', '5組 × 6下', '5組 × 5下', '3組 × 8下'],
        week1Sets: 4, week1Reps: 10,
      },
      {
        planName: '肩膀後三角', exerciseName: '肩膀後三角', muscleGroup: '肩', equipment: '機械', isNewCustom: true,
        weekly: ['6組 × 15下', '6組 × 15下', '6組 × 15下', '3組 × 15下', '6組 × 12下', '6組 × 12下', '6組 × 10下', '3組 × 15下'],
        week1Sets: 6, week1Reps: 15,
      },
    ],
  },
  {
    label: '推 (Push)',
    weeklyTotalSets: ['15組', '15組', '15組', '9組', '15組', '15組', '15組', '6組'],
    exercises: [
      {
        planName: '槓鈴臥推', exerciseName: '槓鈴臥推', muscleGroup: '胸', equipment: '槓鈴', isNewCustom: false,
        weekly: ['6組 × 8下', '6組 × 8下', '6組 × 6下', '3組 × 8下', '6組 × 5下', '6組 × 4下', '6組 × 3下', '測試1RM：65%×5, 75%×3, 85%×2, 95%×1'],
        week1Sets: 6, week1Reps: 8,
      },
      {
        planName: '斜板推', exerciseName: '斜板推', muscleGroup: '胸', equipment: '機械', isNewCustom: true,
        weekly: Array(8).fill('3組 × 10下'),
        week1Sets: 3, week1Reps: 10,
      },
      {
        planName: '水平夾胸', exerciseName: '蝴蝶機夾胸', muscleGroup: '胸', equipment: '機械', isNewCustom: false,
        weekly: ['6組 × 10下', '6組 × 10下', '6組 × 8下', '3組 × 10下', '6組 × 8下', '6組 × 8下', '6組 × 6下', '3組 × 10下'],
        week1Sets: 6, week1Reps: 10,
      },
      {
        planName: '啞鈴或史密斯肩推', exerciseName: '啞鈴肩推', muscleGroup: '肩', equipment: '啞鈴', isNewCustom: false,
        weekly: ['5組 × 10下', '6組 × 10下', '6組 × 8下', '3組 × 10下', '6組 × 6下', '6組 × 6下', '6組 × 5下', '3組 × 8下'],
        week1Sets: 5, week1Reps: 10,
      },
    ],
  },
  {
    label: '腿 (Leg)',
    weeklyTotalSets: Array(8).fill('12組'),
    exercises: [
      {
        planName: '槓鈴深蹲', exerciseName: '槓鈴深蹲', muscleGroup: '腿臀', equipment: '槓鈴', isNewCustom: false,
        weekly: ['3組 × 10下', '3組 × 8下', '3組 × 8下', '3組 × 10下', '3組 × 6下', '3組 × 6下', '3組 × 5下', '3組 × 8下'],
        week1Sets: 3, week1Reps: 10,
      },
      {
        planName: '槓鈴臀推', exerciseName: '槓鈴臀推', muscleGroup: '腿臀', equipment: '槓鈴', isNewCustom: false,
        weekly: ['3組 × 10下', '3組 × 8下', '3組 × 8下', '3組 × 10下', '3組 × 6下', '3組 × 6下', '3組 × 5下', '3組 × 8下'],
        week1Sets: 3, week1Reps: 10,
      },
      {
        planName: '啞鈴羅馬尼亞硬舉 RDL', exerciseName: '啞鈴羅馬尼亞硬舉', muscleGroup: '腿臀', equipment: '啞鈴', isNewCustom: true,
        weekly: ['3組 × 10下', '3組 × 10下', '3組 × 8下', '3組 × 10下', '3組 × 8下', '3組 × 6下', '3組 × 6下', '3組 × 10下'],
        week1Sets: 3, week1Reps: 10,
      },
      {
        planName: '內收機', exerciseName: '內收機', muscleGroup: '腿臀', equipment: '機械', isNewCustom: true,
        weekly: ['3組 × 12下', '3組 × 12下', '3組 × 10下', '3組 × 12下', '3組 × 10下', '3組 × 8下', '3組 × 8下', '3組 × 12下'],
        week1Sets: 3, week1Reps: 12,
      },
    ],
  },
  {
    label: '手 (Arms)',
    weeklyTotalSets: Array(8).fill('16組'),
    exercises: [
      {
        planName: '三頭V把下壓', exerciseName: '纜繩下壓', muscleGroup: '手臂', equipment: '纜繩', isNewCustom: false,
        weekly: ['4組 × 12下', '4組 × 10下', '4組 × 10下', '4組 × 12下', '4組 × 8下', '4組 × 8下', '4組 × 8下', '4組 × 12下'],
        week1Sets: 4, week1Reps: 12,
      },
      {
        planName: '固定器械三頭肌肌力訓練', exerciseName: '固定器械三頭肌肌力訓練', muscleGroup: '手臂', equipment: '機械', isNewCustom: true,
        weekly: ['4組 × 10下', '4組 × 10下', '4組 × 8下', '4組 × 12下', '4組 × 8下', '4組 × 8下', '4組 × 8下', '4組 × 12下'],
        week1Sets: 4, week1Reps: 10,
      },
      {
        planName: '啞鈴二頭肌彎舉', exerciseName: '啞鈴彎舉', muscleGroup: '手臂', equipment: '啞鈴', isNewCustom: false,
        weekly: ['4組 × 12下', '4組 × 12下', '4組 × 10下', '4組 × 12下', '4組 × 8下', '4組 × 8下', '4組 × 8下', '4組 × 12下'],
        week1Sets: 4, week1Reps: 12,
      },
      {
        planName: '固定器械二頭肌肌力訓練', exerciseName: '牧師彎舉', muscleGroup: '手臂', equipment: '機械', isNewCustom: false,
        weekly: ['4組 × 10下', '4組 × 10下', '4組 × 8下', '4組 × 12下', '4組 × 8下', '4組 × 8下', '4組 × 8下', '4組 × 12下'],
        week1Sets: 4, week1Reps: 10,
      },
      {
        planName: '肩膀側平舉', exerciseName: '啞鈴側平舉', muscleGroup: '肩', equipment: '啞鈴', isNewCustom: false,
        weekly: ['3組 × 10下', '3組 × 10下', '4組 × 8下', '3組 × 12下', '4組 × 8下', '4組 × 8下', '5組 × 8下', '3組 × 12下'],
        week1Sets: 3, week1Reps: 10,
      },
    ],
  },
];

export const ZONGYUAN_COACH_CHECK_TABLE = {
  title: '教練原始容量覆核對照（各部位週總容量檢核）',
  rows: [
    { part: '胸大肌 (槓鈴臥推 + 斜板推)', values: [16, 17, 19, 8, 17, 18, 19, 10] },
    { part: '背肌 (槓鈴划船 + 兩項滑輪下拉)', values: [18, 19, 21, 10, 20, 21, 22, 10] },
    { part: '肩部 (推日肩推 + 拉日側平舉飛鳥)', values: [15, 16, 18, 8, 18, 19, 20, 10] },
    { part: '三頭肌 (手日兩項三頭動作加總)', values: [12, 13, 14, 6, 14, 15, 16, 7] },
    { part: '二頭肌 (手日兩項二頭動作加總)', values: [10, 11, 12, 5, 12, 13, 14, 6] },
    { part: '下肢整體 (腿日四項核心動作)', values: [12, 14, 16, 8, 14, 16, 12, 10] },
  ],
};
