export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  description: string;
  accent: string;
  image: string;
};

export const products: Product[] = [
  {
    id: 'luma-lamp',
    name: 'Luma Desk Lamp',
    category: 'Lighting',
    price: 94,
    rating: 4.8,
    description: 'Minimal ambient lighting with touch dimming and warm LED output.',
    accent: 'from-amber-200 to-yellow-100',
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'nova-headphones',
    name: 'Nova Wireless Headphones',
    category: 'Audio',
    price: 186,
    rating: 4.9,
    description: 'Noise-cancelling headphones tuned for focus and long-form listening.',
    accent: 'from-indigo-200 to-blue-100',
    image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'orbit-sneaker',
    name: 'Orbit Everyday Sneaker',
    category: 'Footwear',
    price: 128,
    rating: 4.7,
    description: 'Flexible sole and lightweight knit upper designed for all-day wear.',
    accent: 'from-cyan-200 to-teal-100',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'atlas-backpack',
    name: 'Atlas Urban Backpack',
    category: 'Travel',
    price: 142,
    rating: 4.8,
    description: 'Structured storage with weather-ready fabric and ergonomic support.',
    accent: 'from-rose-200 to-orange-100',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
  },
];
