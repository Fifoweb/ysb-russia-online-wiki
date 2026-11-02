import { ChartLineUp, CheckCircle, Coins, GraduationCap, Handshake, Motorcycle, Package, Parachute, PoliceCar, ShieldCheck, Trophy, UsersThree, type Icon } from '@phosphor-icons/react';
const icons: Record<string, Icon> = {
  discipline: ShieldCheck, 'joint-exercises': Handshake, detainees: PoliceCar,
  recruitment: UsersThree, fines: Coins, warehouse: Package, motorcyclists: Motorcycle,
  'academy-graduates': GraduationCap, 'average-online': ChartLineUp,
  airdrop: Parachute, escorts: PoliceCar, 'clean-week': CheckCircle,
};
export default function AchievementIcon({ id, size = 24 }: { id: string; size?: number }) {
  const IconComponent = icons[id] || Trophy;
  return <IconComponent size={size} weight="duotone" aria-hidden="true" />;
}
