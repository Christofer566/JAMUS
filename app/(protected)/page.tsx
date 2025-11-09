// app/(protected)/page.tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/feed');
}