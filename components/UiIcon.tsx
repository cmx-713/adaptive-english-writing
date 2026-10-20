import React from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Brain,
  ChartColumn,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Dumbbell,
  FileText,
  FolderOpen,
  Lightbulb,
  Leaf,
  LogOut,
  Plus,
  RefreshCw,
  Scale,
  Save,
  Settings,
  ShieldAlert,
  Shuffle,
  Timer,
  Trash2,
  Users,
  Wallet,
  Zap,
  HeartPulse,
  GraduationCap,
  X,
  type LucideIcon,
} from 'lucide-react';

const icons = {
  activity: Activity,
  arrowRight: ArrowRight,
  book: BookOpen,
  brain: Brain,
  chart: ChartColumn,
  check: Check,
  chevronDown: ChevronDown,
  alert: CircleAlert,
  success: CircleCheck,
  help: CircleHelp,
  clipboard: ClipboardCheck,
  copy: Copy,
  drills: Dumbbell,
  essay: FileText,
  folder: FolderOpen,
  idea: Lightbulb,
  leaf: Leaf,
  logout: LogOut,
  plus: Plus,
  refresh: RefreshCw,
  save: Save,
  settings: Settings,
  security: ShieldAlert,
  scale: Scale,
  shuffle: Shuffle,
  timer: Timer,
  delete: Trash2,
  users: Users,
  wallet: Wallet,
  zap: Zap,
  health: HeartPulse,
  education: GraduationCap,
  close: X,
} satisfies Record<string, LucideIcon>;

export type UiIconName = keyof typeof icons;

interface UiIconProps extends React.SVGProps<SVGSVGElement> {
  name: UiIconName;
  size?: number;
}

const UiIcon: React.FC<UiIconProps> = ({ name, size = 18, strokeWidth = 1.8, ...props }) => {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...props} />;
};

export default UiIcon;
