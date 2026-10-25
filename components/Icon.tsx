// 그림 아이콘 (구현명세 §7-0). 같은 그림을 다른 뜻에 쓰지 않는다(지침 4.2.8). 크기 기본 48px.
import {
  Banknote,
  Building2,
  CalendarX,
  CircleHelp,
  CreditCard,
  HandCoins,
  HeartHandshake,
  Landmark,
  MessageSquare,
  Phone,
  ShoppingBag,
  Smartphone,
  TrendingDown,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Picture, Relation } from "@/lib/engine/types";

export const PICTURE_ICON: Record<Picture, LucideIcon> = {
  money_send: HandCoins,
  cash: Banknote,
  loan: Landmark,
  phone: Smartphone,
  card_pay: CreditCard,
  salary: Wallet,
  salary_cut: CalendarX,
  leak: TrendingDown,
  big: ShoppingBag,
  question: CircleHelp,
};

export const RELATION_ICON: Record<Relation, LucideIcon> = {
  family: Users,
  center: Building2,
  activity: HeartHandshake,
  other: User,
};

export const RELATION_LABEL: Record<Relation, string> = {
  family: "가족",
  center: "지원센터 선생님",
  activity: "활동지원사",
  other: "그 밖의 사람",
};

export const CounselIcon = Phone;
export const MessageIcon = MessageSquare;

export function PictureIcon({ picture, size = 48, className }: { picture: Picture; size?: number; className?: string }) {
  const I = PICTURE_ICON[picture] ?? CircleHelp;
  return <I size={size} strokeWidth={1.75} aria-hidden="true" className={className} />;
}

export function RelationIcon({ relation, size = 48, className }: { relation: Relation; size?: number; className?: string }) {
  const I = RELATION_ICON[relation] ?? User;
  return <I size={size} strokeWidth={1.75} aria-hidden="true" className={className} />;
}
