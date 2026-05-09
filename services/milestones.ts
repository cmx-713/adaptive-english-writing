/**
 * 学习中心「学习里程碑」徽章：纯数据判断，无副作用，便于测试与复用。
 */

export interface MilestoneInput {
  socraticCount: number;
  graderCount: number;
  drillCount: number;
  /** 本地 + 云端作文批改中的历史最高分（满分 15） */
  essayMaxScore: number;
  /** 已有审辨信度分析的思维训练次数 */
  ctrlAnalyzedCount: number;
}

export interface MilestoneState {
  id: string;
  label: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

const DEFS: ReadonlyArray<{
  id: string;
  label: string;
  icon: string;
  description: string;
  unlocked: (i: MilestoneInput) => boolean;
}> = [
  {
    id: 'socratic_5',
    label: '思辨常客',
    icon: '🧠',
    description: '累积完成 5 次思维训练（含观点构思与语言支架记录）',
    unlocked: (i) => i.socraticCount >= 5,
  },
  {
    id: 'essay_10',
    label: '十分突破',
    icon: '✨',
    description: '任一次作文批改总分达到 10 分及以上',
    unlocked: (i) => i.essayMaxScore >= 10,
  },
  {
    id: 'essay_12',
    label: '十二荣光',
    icon: '⭐',
    description: '任一次作文批改总分达到 12 分及以上',
    unlocked: (i) => i.essayMaxScore >= 12,
  },
  {
    id: 'grader_5',
    label: '笔耕不辍',
    icon: '✍️',
    description: '累积完成 5 次作文批改',
    unlocked: (i) => i.graderCount >= 5,
  },
  {
    id: 'drill_5',
    label: '特训达人',
    icon: '🏋️',
    description: '累积完成 5 次句子特训',
    unlocked: (i) => i.drillCount >= 5,
  },
  {
    id: 'ctrl_1',
    label: '审辨起步',
    icon: '🔍',
    description: '获得至少 1 次审辨信度分析',
    unlocked: (i) => i.ctrlAnalyzedCount >= 1,
  },
  {
    id: 'ctrl_3',
    label: '审辨进阶',
    icon: '📈',
    description: '累积 3 次及以上审辨信度记录',
    unlocked: (i) => i.ctrlAnalyzedCount >= 3,
  },
];

/** 已解锁的排在前面，便于一眼看到成就 */
export function computeMilestones(input: MilestoneInput): MilestoneState[] {
  const list = DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    icon: d.icon,
    description: d.description,
    unlocked: d.unlocked(input),
  }));
  return list.sort((a, b) => {
    if (a.unlocked === b.unlocked) return 0;
    return a.unlocked ? -1 : 1;
  });
}
