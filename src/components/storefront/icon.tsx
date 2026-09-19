import {
  Award,
  Beef,
  Cake,
  ChefHat,
  Clock,
  Coffee,
  Croissant,
  CupSoda,
  Flame,
  Heart,
  IceCream,
  Leaf,
  MapPin,
  Pizza,
  Salad,
  Sandwich,
  Sparkles,
  Star,
  Truck,
  Users,
  Utensils,
  Wheat,
  type LucideIcon,
} from "lucide-react";

/**
 * Sections and categories reference icons by name from the database, so unknown
 * names must degrade to a sensible default instead of breaking the page.
 */
const ICONS: Record<string, LucideIcon> = {
  award: Award,
  beef: Beef,
  cake: Cake,
  "chef-hat": ChefHat,
  clock: Clock,
  coffee: Coffee,
  croissant: Croissant,
  "cup-soda": CupSoda,
  flame: Flame,
  heart: Heart,
  "ice-cream": IceCream,
  leaf: Leaf,
  "map-pin": MapPin,
  pizza: Pizza,
  salad: Salad,
  sandwich: Sandwich,
  sparkles: Sparkles,
  star: Star,
  truck: Truck,
  users: Users,
  utensils: Utensils,
  wheat: Wheat,
};

export function SectionIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = ICONS[(name ?? "sparkles").toLowerCase()] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
