import {
  Bike,
  BookOpen,
  Briefcase,
  Heart,
  Leaf,
  Palette,
  Sprout,
  Users,
  Monitor,
} from 'lucide-react';

const styles = {
  Environment: { icon: Leaf, tone: 'nature' },
  Community: { icon: Users, tone: 'community' },
  Transport: { icon: Bike, tone: 'mobility' },
  Food: { icon: Sprout, tone: 'nature' },
  Technology: { icon: Monitor, tone: 'mobility' },
  'Arts & culture': { icon: Palette, tone: 'community' },
  'Health & safety': { icon: Heart, tone: 'community' },
  Education: { icon: BookOpen, tone: 'mobility' },
  'Work & industry': { icon: Briefcase, tone: 'neutral' },
};

export function categoryTone(name: string) {
  return styles[name as keyof typeof styles]?.tone ?? 'neutral';
}

export function CategoryIcon({ name }: { name: string }) {
  const Icon = styles[name as keyof typeof styles]?.icon ?? Users;
  return <Icon size={14} aria-hidden="true" />;
}

export function CategoryBadge({ name }: { name: string }) {
  return (
    <span className={`category-badge category-${categoryTone(name)}`}>
      <CategoryIcon name={name} />
      {name}
    </span>
  );
}
