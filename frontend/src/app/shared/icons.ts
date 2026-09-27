import {
  Target, Plane, Shield, Key, Home, Car, Heart, PiggyBank, GraduationCap,
  Gift, ShoppingCart, Utensils, BookOpen, Tv, HeartPulse, Shirt, FerrisWheel,
  PawPrint, Landmark, AlertTriangle, Wallet,
  User, Smile, Star, Crown, Sparkles, Flower2, Cat, Dog, Bird, Fish,
  Gamepad2, Music, Headphones, Coffee, Pizza, IceCreamCone, Rocket,
  Sun, Moon, Zap, Camera, Gem, Dumbbell,
} from 'lucide-angular';

// Registro central de ícones por chave (persistida no banco como string)
export const ICON_REGISTRY: Record<string, any> = {
  target: Target,
  plane: Plane,
  shield: Shield,
  key: Key,
  home: Home,
  car: Car,
  heart: Heart,
  'piggy-bank': PiggyBank,
  education: GraduationCap,
  'graduation-cap': GraduationCap,
  gift: Gift,
  cart: ShoppingCart,
  'shopping-cart': ShoppingCart,
  food: Utensils,
  utensils: Utensils,
  'book-open': BookOpen,
  tv: Tv,
  'heart-pulse': HeartPulse,
  shirt: Shirt,
  'ferris-wheel': FerrisWheel,
  'paw-print': PawPrint,
  landmark: Landmark,
  'alert-triangle': AlertTriangle,
  wallet: Wallet,
};

// Chaves oferecidas no seletor de ícones das categorias
export const ICON_KEYS = [
  'target', 'plane', 'shield', 'key', 'home', 'car', 'heart', 'piggy-bank',
  'education', 'gift', 'cart', 'food',
];

export function iconFor(key: string): any {
  return ICON_REGISTRY[key] ?? Target;
}

// ---- Ícones de avatar de usuário ----
// Chaves espelhadas na API (api/src/users/user-icons.ts), que valida o PATCH.
export const USER_ICON_REGISTRY: Record<string, any> = {
  user: User,
  smile: Smile,
  heart: Heart,
  star: Star,
  crown: Crown,
  sparkles: Sparkles,
  flower: Flower2,
  cat: Cat,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  gamepad: Gamepad2,
  music: Music,
  headphones: Headphones,
  coffee: Coffee,
  pizza: Pizza,
  'ice-cream': IceCreamCone,
  rocket: Rocket,
  sun: Sun,
  moon: Moon,
  zap: Zap,
  camera: Camera,
  gem: Gem,
  dumbbell: Dumbbell,
};

export const USER_ICON_KEYS = Object.keys(USER_ICON_REGISTRY);

// null = chave desconhecida/ausente → quem chama mostra a inicial
export function userIconFor(key: string | null | undefined): any | null {
  return key ? USER_ICON_REGISTRY[key] ?? null : null;
}
