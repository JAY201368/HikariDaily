import type { Metadata } from 'next';
import { Showcase } from '@/components/showcase/showcase';

export const metadata: Metadata = {
  title: '逐光日刊 · 功能与交互展示',
  description: '翻阅摄影天气日报，打开随身仪表、外拍手册与拍摄计划本。',
};

export default function ShowcasePage() { return <Showcase />; }
